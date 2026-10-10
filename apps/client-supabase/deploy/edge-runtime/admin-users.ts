import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') || 'http://localhost:5180',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const allowedModules = new Set([
  'dashboard','clients','proposals','contracts','orders','tasks','calendar','finance',
  'documents','coupons','support','reports','catalogs','settings','notices'
]);

export async function handleRequest(request: Request) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'Método não permitido.' }, { status: 405, headers: corsHeaders });
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'Sessão administrativa necessária.' }, { status: 401, headers: corsHeaders });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const caller = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const privileged = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  let createdUserId: string | null = null;
  try {
    const { data: actor, error: actorError } = await caller.auth.getUser(token);
    if (actorError || !actor.user) throw new Error('Sessão administrativa inválida.');
    const body = await request.json();
    const action = String(body?.action || 'list');
    const { data: actorProfile, error: actorProfileError } = await privileged.from('gsa_profiles')
      .select('role,permissions,active').eq('id',actor.user.id).single();
    if (actorProfileError || !actorProfile?.active || actorProfile.role !== 'admin') throw new Error('Perfil administrativo inválido.');
    const actorPermissions: string[] = Array.isArray(actorProfile.permissions) ? actorProfile.permissions.map(String) : [];
    const isSuperAdmin = actorPermissions.includes('*');
    const requiredModule = ['delete-client','deactivate-client'].includes(action) ? 'clients' : 'settings';
    const { data: allowed, error: accessError } = await caller.rpc('gsa_admin_has_module', { p_module: requiredModule });
    if (accessError || !allowed) throw new Error('Seu usuário não tem permissão para gerenciar acessos.');

    if (action === 'delete-client') {
      const clientId = String(body?.clientId || '');
      const { data: customer, error: customerError } = await privileged.from('gsa_clients')
        .select('id,legacy_id,status').eq('legacy_id', clientId).maybeSingle();
      if (customerError || !customer) throw new Error('Cliente não encontrado.');
      if (customer.status === 'active') throw new Error('Desative o cadastro antes da exclusão definitiva.');
      const { data: records, error: recordsError } = await privileged.from('gsa_legacy_records')
        .select('id,kind,payload').eq('customer_id', customer.id);
      if (recordsError) throw recordsError;
      const filePaths = new Set<string>();
      for (const row of records || []) {
        const payload = row.payload || {};
        for (const version of payload.versions || []) if (version.fileId) filePaths.add(String(version.fileId));
        if (payload.fileId) filePaths.add(String(payload.fileId));
        if (payload.pdfFileId) filePaths.add(String(payload.pdfFileId));
        for (const message of payload.messages || []) for (const file of message.files || message.attachments || []) {
          if (file?.fileId) filePaths.add(String(file.fileId));
        }
      }
      if (filePaths.size) await privileged.storage.from('gsa3-private').remove([...filePaths]);
      const { error: deleteError } = await privileged.from('gsa_legacy_records').delete().eq('customer_id', customer.id);
      if (deleteError) throw deleteError;
      await privileged.from('gsa_legacy_records').delete().eq('kind','clients').eq('id',clientId);
      const { data: clientProfiles, error: profileLookupError } = await privileged.from('gsa_profiles').select('id').eq('customer_id',customer.id);
      if (profileLookupError) throw profileLookupError;
      for (const profile of clientProfiles || []) {
        const { error: authDeleteError } = await privileged.auth.admin.deleteUser(profile.id);
        if (authDeleteError) throw authDeleteError;
      }
      const { error: profilesError } = await privileged.from('gsa_profiles').delete().eq('customer_id', customer.id);
      if (profilesError) throw profilesError;
      const { error: deleteCustomerError } = await privileged.from('gsa_clients').delete().eq('id', customer.id);
      if (deleteCustomerError) throw deleteCustomerError;
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    if (action === 'deactivate-client') {
      const clientId = String(body?.clientId || '');
      const { data: customer, error: customerError } = await privileged.from('gsa_clients')
        .select('id,legacy_id').eq('legacy_id', clientId).maybeSingle();
      if (customerError || !customer) throw new Error('Cliente não encontrado.');
      const { error: profileError } = await privileged.from('gsa_profiles').update({ active:false }).eq('customer_id',customer.id).eq('role','client');
      if (profileError) throw profileError;
      const { data: requests, error: requestsError } = await privileged.from('gsa_legacy_records')
        .select('id,payload').eq('kind','account_deletion_requests').eq('customer_id',customer.id);
      if (requestsError) throw requestsError;
      for (const row of requests || []) if (row.payload?.status === 'pending') {
        const { error } = await privileged.from('gsa_legacy_records').update({ payload:{...row.payload,status:'approved',approvedAt:new Date().toISOString()},updated_at:new Date().toISOString() }).eq('kind','account_deletion_requests').eq('id',row.id);
        if (error) throw error;
      }
      return Response.json({ ok:true },{headers:corsHeaders});
    }
    if (action === 'list') {
      const { data, error } = await privileged.from('gsa_profiles')
        .select('id,email,full_name,admin_role,permissions,active').eq('role','admin').order('full_name');
      if (error) throw error;
      return Response.json((data || []).map((row) => ({
        id: row.id, name: row.full_name, email: row.email || '', role: 'admin',
        adminRole: row.admin_role || 'Administrador Geral', permissions: row.permissions || [], active: row.active
      })), { headers: corsHeaders });
    }

    if (action === 'create') {
      const name = String(body?.name || '').trim();
      const email = String(body?.email || '').trim().toLowerCase();
      const password = String(body?.password || '');
      const adminRole = String(body?.adminRole || 'Personalizado');
      const requested = [...new Set((Array.isArray(body?.permissions) ? body.permissions : []).map(String))];
      const permissions = requested.includes('*') ? ['*'] : requested.filter((permission) => allowedModules.has(permission));
      if (!name || !email || password.length < 10 || !permissions.length) {
        throw new Error('Informe nome, e-mail, senha com 10 caracteres e ao menos um módulo.');
      }
      if (!isSuperAdmin && (permissions.includes('*') || permissions.some((permission) => !actorPermissions.includes(permission)))) {
        throw new Error('Você não pode conceder módulos que não possui.');
      }
      const { data: created, error: createError } = await privileged.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: name, portal_role: 'admin' }
      });
      if (createError || !created.user) throw new Error(createError?.message || 'Não foi possível criar o usuário.');
      createdUserId = created.user.id;
      const { error: profileError } = await privileged.from('gsa_profiles').insert({
        id: createdUserId, email, full_name: name, role: 'admin', admin_role: adminRole,
        permissions, active: true, customer_id: null
      });
      if (profileError) throw profileError;
      return Response.json({ id: createdUserId, name, email, role: 'admin', adminRole, permissions, active: true }, { headers: corsHeaders });
    }

    const userId = String(body?.userId || '');
    if (!userId) throw new Error('Usuário não informado.');
    const { data: target, error: targetError } = await privileged.from('gsa_profiles')
      .select('id,role,permissions').eq('id',userId).maybeSingle();
    if (targetError || !target || target.role !== 'admin') throw new Error('Usuário administrativo não encontrado.');
    const targetPermissions: string[] = Array.isArray(target.permissions) ? target.permissions.map(String) : [];
    if (!isSuperAdmin && (targetPermissions.includes('*') || targetPermissions.some((permission) => !actorPermissions.includes(permission)))) {
      throw new Error('Você não pode alterar um usuário com módulos superiores aos seus.');
    }

    if (action === 'permissions') {
      const requested = [...new Set((Array.isArray(body?.permissions) ? body.permissions : []).map(String))];
      const permissions = requested.includes('*') ? ['*'] : requested.filter((permission) => allowedModules.has(permission));
      if (!permissions.length) throw new Error('Selecione ao menos um módulo para este usuário.');
      if (!isSuperAdmin && (permissions.includes('*') || permissions.some((permission) => !actorPermissions.includes(permission)))) {
        throw new Error('Você não pode conceder módulos que não possui.');
      }
      const { data, error } = await privileged.from('gsa_profiles').update({
        admin_role: String(body?.adminRole || 'Personalizado'), permissions
      }).eq('id',userId).select('id,email,full_name,admin_role,permissions,active').single();
      if (error) throw error;
      return Response.json({ id:data.id,name:data.full_name,email:data.email,role:'admin',adminRole:data.admin_role,permissions:data.permissions,active:data.active }, { headers:corsHeaders });
    }

    if (action === 'password') {
      const password = String(body?.password || '');
      if (password.length < 10) throw new Error('A senha deve ter pelo menos 10 caracteres.');
      const { error } = await privileged.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      return Response.json({ ok: true }, { headers: corsHeaders });
    }
    throw new Error('Ação de usuário desconhecida.');
  } catch (error) {
    if (createdUserId) await privileged.auth.admin.deleteUser(createdUserId);
    return Response.json({ error: error instanceof Error ? error.message : 'Não foi possível concluir a operação.' }, { status: 400, headers: corsHeaders });
  }
}

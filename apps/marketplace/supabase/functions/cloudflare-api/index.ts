import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

function configuredOrigins() {
  return (Deno.env.get('ALLOWED_ORIGINS') || DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',').map((o) => o.trim()).filter(Boolean);
}

function corsHeaders(origin: string | null) {
  const allowed = origin && configuredOrigins().includes(origin) ? origin : '';
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, GET, OPTIONS, DELETE',
    'access-control-max-age': '86400',
    vary: 'Origin'
  };
}

function json(status: number, body: Record<string, unknown>, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(origin) }
  });
}

async function handleRequest(request: Request) {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

  // Autenticação básica
  const authHeader = request.headers.get('authorization') || (request.headers.get('apikey') ? `Bearer ${request.headers.get('apikey')}` : null);
  if (!authHeader) return json(401, { error: 'Missing authorization header' }, origin);
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  
  if (!supabaseUrl || !supabaseAnonKey) {
    return json(500, { error: 'Supabase URL or Anon Key not configured' }, origin);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = authHeader.replace(/^bearer\s+/i, '').trim();
  const isServiceRole = Boolean(serviceRoleKey && token === serviceRoleKey);

  if (!isServiceRole) {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json(401, { error: 'Unauthorized user' }, origin);

    const actorType = user.app_metadata?.gsa_actor_type || user.app_metadata?.role || user.user_metadata?.role || user.role;
    const isPrivileged = actorType === 'admin' || actorType === 'colaborador' || user.role === 'service_role';
    if (!isPrivileged) {
      return json(403, { error: 'Forbidden: requires admin or colaborador role' }, origin);
    }
  }

  const cfToken = Deno.env.get('CLOUDFLARE_API_TOKEN');
  const cfZoneId = Deno.env.get('CLOUDFLARE_ZONE_ID');
  
  if (!cfToken || !cfZoneId) {
    return json(500, { error: 'Cloudflare credentials not configured in secrets' }, origin);
  }

  const url = new URL(request.url);
  const path = url.pathname.replace('/cloudflare-api', ''); // Ajuste
  const method = request.method;

  const cfHeaders = {
    'Authorization': `Bearer ${cfToken}`,
    'Content-Type': 'application/json',
  };

  try {
    if (method === 'GET' && path.endsWith('/zone')) {
      const resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${cfZoneId}`, { headers: cfHeaders });
      const data = await resp.json();
      return json(200, data, origin);
    }
    
    if (method === 'GET' && path.endsWith('/dns')) {
      const resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${cfZoneId}/dns_records`, { headers: cfHeaders });
      const data = await resp.json();
      return json(200, data, origin);
    }

    if (method === 'POST' && path.endsWith('/purge-cache')) {
      const body = await request.json();
      const payload = body.files ? { files: body.files } : { purge_everything: true };
      
      const resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${cfZoneId}/purge_cache`, {
        method: 'POST',
        headers: cfHeaders,
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      return json(200, data, origin);
    }

    if (method === 'POST' && path.endsWith('/dev-mode')) {
      const body = await request.json();
      const value = body.value === 'on' ? 'on' : 'off';
      
      const resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${cfZoneId}/settings/development_mode`, {
        method: 'PATCH',
        headers: cfHeaders,
        body: JSON.stringify({ value })
      });
      const data = await resp.json();
      return json(200, data, origin);
    }

    if (method === 'POST' && path.endsWith('/under-attack')) {
      const body = await request.json();
      const value = body.value === 'under_attack' ? 'under_attack' : 'essentially_off';
      
      const resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${cfZoneId}/settings/security_level`, {
        method: 'PATCH',
        headers: cfHeaders,
        body: JSON.stringify({ value })
      });
      const data = await resp.json();
      return json(200, data, origin);
    }

    return json(404, { error: 'Route not found' }, origin);

  } catch (err: any) {
    return json(500, { error: err.message }, origin);
  }
}

if (import.meta.main) Deno.serve(handleRequest);

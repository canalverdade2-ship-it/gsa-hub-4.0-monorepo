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
    'access-control-allow-methods': 'POST, GET, OPTIONS',
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

  // Autenticação WebSocket geralmente passa token via querystring ou protocolos sec
  const url = new URL(request.url);
  const authHeader = request.headers.get('authorization') || '';
  const tokenFromHeader = authHeader.replace(/^bearer\s+/i, '').trim();
  const token = url.searchParams.get('token') || tokenFromHeader || request.headers.get('apikey');
  
  if (!token) {
    return json(401, { error: 'Missing token' }, origin);
  }
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseAnonKey) {
    return json(500, { error: 'Supabase URL or Anon Key not configured' }, origin);
  }

  const isServiceRole = Boolean(serviceRoleKey && token === serviceRoleKey);

  if (!isServiceRole) {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json(401, { error: 'Unauthorized user' }, origin);

    const actorType = user.app_metadata?.gsa_actor_type || user.app_metadata?.role || user.user_metadata?.role || user.role;
    const isPrivileged = actorType === 'admin' || actorType === 'colaborador' || user.role === 'service_role';
    if (!isPrivileged) {
      return json(403, { error: 'Forbidden: requires admin or colaborador role' }, origin);
    }
  }

  if (request.headers.get("upgrade") !== "websocket") {
    return json(400, { error: 'Requires WebSocket connection' }, origin);
  }

  const { socket, response } = Deno.upgradeWebSocket(request);

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'connected', message: 'Conectado ao Túnel SSH Proxy' }));
    // Aqui iniciaria a conexão SSH real usando a lib ssh2 e repassaria os bytes
  };

  socket.onmessage = (e) => {
    // Repassa os bytes do terminal web (xterm) para o SSH
    // Ex: sshClient.write(e.data)
  };

  socket.onclose = () => {
    // sshClient.end()
  };

  socket.onerror = (e) => {
    console.error("WebSocket error:", e);
  };

  return response;
}

if (import.meta.main) Deno.serve(handleRequest);

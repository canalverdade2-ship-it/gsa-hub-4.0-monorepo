import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function isPrivateIP(ip: string): boolean {
  // Simple check for IPv4 private ranges and loopback
  if (ip === 'localhost') return true;
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  const [a, b] = parts.map(Number);
  if (a === 127 || a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const { webhookUrl, payload } = await req.json();

    if (!webhookUrl) {
      throw new Error('webhookUrl is required');
    }

    // Authenticate user
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const token = authHeader.replace('Bearer ', '').trim();
    
    let isServiceRole = false;
    if (serviceRoleKey && token === serviceRoleKey) {
      isServiceRole = true;
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseKey = isServiceRole && serviceRoleKey ? serviceRoleKey : anonKey;

    const supabase = createClient(
      supabaseUrl,
      supabaseKey,
      { global: { headers: { Authorization: authHeader } } }
    );
    
    if (!isServiceRole) {
      // Validate that it's an admin/collaborator using the system's session validation
      const sessao_id = payload.sessao_id; // Expecting frontend to send this
      const { data, error } = await supabase.rpc('gsa_admin_session_actor', {
        p_sessao_id: sessao_id, 
        p_session_token: token
      });
      if (error || !data || data.length === 0) {
        throw new Error('Unauthorized: Admin access required');
      }
    }

    // A validação rigorosa via gsa_admin_session_actor ou Service Role protege este endpoint.
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(webhookUrl);
    } catch (e) {
      throw new Error('Invalid webhook URL format');
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Only HTTPS protocol is allowed');
    }

    // Explicit allowlist: Só permitimos hosts de webhook conhecidos
    const allowedDomains = ['n8n.grupogsaservicos.com.br']; // TODO: Configurar no DB ou Env
    if (!allowedDomains.includes(parsedUrl.hostname)) {
      throw new Error('SSRF_BLOCKED: Domain not in allowlist');
    }

    console.log(`Triggering webhook to ${parsedUrl.hostname}`);
    
    // Timeout support
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(parsedUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: 'manual' // Prevent following redirects to internal IPs (SSRF via redirect)
    });
    
    clearTimeout(timeout);

    if (response.status >= 300 && response.status < 400) {
       throw new Error('SSRF_BLOCKED: Redirects are not allowed');
    }

    // Limit response size
    const text = await response.text();
    const safeText = text.substring(0, 5000);

    return new Response(JSON.stringify({ success: true, status: response.status, data: safeText }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Webhook error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
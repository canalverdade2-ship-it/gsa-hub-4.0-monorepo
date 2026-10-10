import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE" | "CUSTOM_EVENT";
  table?: string;
  record?: any;
  old_record?: any;
  event_name?: "ABANDONED_CART" | "SUBSCRIPTION_RENEWAL";
  payload?: any;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Validação de autorização para prevenir open relay abuse
  const authHeader = req.headers.get("authorization") || "";
  const apiKeyHeader = req.headers.get("apikey") || "";
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : apiKeyHeader;
  const webhookSecretHeader = req.headers.get("x-webhook-secret") || "";

  const expectedServiceRoleKey = SUPABASE_SERVICE_ROLE_KEY || "";
  const expectedWebhookSecret = Deno.env.get("WEBHOOK_SECRET") || Deno.env.get("TRANSACTIONAL_EMAIL_SECRET") || "";

  let isAuthorized =
    (Boolean(expectedServiceRoleKey) && bearerToken === expectedServiceRoleKey) ||
    (Boolean(expectedWebhookSecret) && (bearerToken === expectedWebhookSecret || webhookSecretHeader === expectedWebhookSecret));

  // Fallback: se bearerToken for um JWT de usuário autenticado, verificar se possui papel administrativo
  if (!isAuthorized && bearerToken && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: { user }, error: userErr } = await authClient.auth.getUser(bearerToken);
      if (!userErr && user) {
        const actorType = user.app_metadata?.gsa_actor_type || user.app_metadata?.role || user.user_metadata?.role || user.role;
        if (actorType === "admin" || actorType === "colaborador" || user.role === "service_role") {
          isAuthorized = true;
        }
      }
    } catch {
      isAuthorized = false;
    }
  }

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: "Unauthorized: valid service_role key or webhook secret required" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  }

  try {
    const payload: WebhookPayload = await req.json();

    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is missing");
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    let emailOptions: any = null;

    if (payload.table === "orcamentos") {
      const orcamento = payload.record;
      
      // Obter dados do cliente
      const { data: cliente } = await supabase
        .from("clientes")
        .select("nome, email")
        .eq("id", orcamento.cliente_id)
        .maybeSingle();

      if (!cliente || !cliente.email) {
        return new Response(JSON.stringify({ message: "Client or email not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200, // Não dar erro para não travar o webhook
        });
      }

      // Notificação de Novo Pedido (INSERT)
      if (payload.type === "INSERT") {
        emailOptions = {
          from: "GSA Store <contato@grupogsa.com.br>",
          to: [cliente.email],
          subject: `GSA Store - Seu pedido #${orcamento.id} foi recebido!`,
          html: `
            <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; color: #333;">
              <h2 style="color: #17345f;">Olá, ${cliente.nome}!</h2>
              <p>Recebemos o seu pedido na GSA Store e já estamos cuidando de tudo.</p>
              <p><strong>Status do Pedido:</strong> Aguardando Confirmação</p>
              <p>Você pode acompanhar o status através do <a href="https://grupogsa.com.br/cliente/dashboard">Portal do Cliente</a>.</p>
              <br/>
              <p>Agradecemos a preferência!</p>
              <p>Atenciosamente,<br/>Equipe GSA Store</p>
            </div>
          `,
        };
      }
      
      // Notificação de Atualização de Status (UPDATE)
      if (payload.type === "UPDATE" && payload.old_record.status !== payload.record.status) {
        let statusLabel = orcamento.status;
        if (orcamento.status === "aprovado") statusLabel = "Aprovado / Em andamento";
        if (orcamento.status === "concluido") statusLabel = "Concluído";
        if (orcamento.status === "cancelado") statusLabel = "Cancelado";

        emailOptions = {
          from: "GSA Store <contato@grupogsa.com.br>",
          to: [cliente.email],
          subject: `GSA Store - Atualização no pedido #${orcamento.id}`,
          html: `
            <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; color: #333;">
              <h2 style="color: #17345f;">Olá, ${cliente.nome}!</h2>
              <p>Temos uma atualização sobre o seu pedido.</p>
              <p><strong>Novo Status:</strong> <span style="font-weight: bold; color: #d8bd73;">${statusLabel.toUpperCase()}</span></p>
              <p>Para mais detalhes, acesse o <a href="https://grupogsa.com.br/cliente/dashboard">Portal do Cliente</a>.</p>
              <br/>
              <p>Atenciosamente,<br/>Equipe GSA Store</p>
            </div>
          `,
        };
      }
    } else if (payload.type === "CUSTOM_EVENT" && payload.event_name === "ABANDONED_CART") {
      // Exemplo: chamado via pg_cron ou N8N passando os dados do cliente e carrinho
      const { cliente, carrinhoUrl } = payload.payload;
      emailOptions = {
        from: "GSA Store <contato@grupogsa.com.br>",
        to: [cliente.email],
        subject: `GSA Store - Você esqueceu algo no carrinho!`,
        html: `
          <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #17345f;">Olá, ${cliente.nome}!</h2>
            <p>Vimos que você adicionou alguns produtos incríveis no carrinho, mas não finalizou a compra.</p>
            <p>Os itens ainda estão reservados para você. Clique no link abaixo para concluir sua compra com segurança:</p>
            <p><a href="${carrinhoUrl}" style="background-color: #d8bd73; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Finalizar Compra</a></p>
            <br/>
            <p>Atenciosamente,<br/>Equipe GSA Store</p>
          </div>
        `,
      };
    } else if (payload.type === "CUSTOM_EVENT" && payload.event_name === "SUBSCRIPTION_RENEWAL") {
      const { cliente, assinaturaNome, proximaCobranca } = payload.payload;
      emailOptions = {
        from: "GSA Store <contato@grupogsa.com.br>",
        to: [cliente.email],
        subject: `GSA Store - Lembrete de Renovação de Assinatura`,
        html: `
          <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #17345f;">Olá, ${cliente.nome}!</h2>
            <p>Sua assinatura <strong>${assinaturaNome}</strong> será renovada em breve.</p>
            <p>Data da próxima cobrança: <strong>${proximaCobranca}</strong></p>
            <p>Você pode gerenciar suas assinaturas no <a href="https://grupogsa.com.br/cliente/dashboard">Portal do Cliente</a>.</p>
            <br/>
            <p>Atenciosamente,<br/>Equipe GSA Store</p>
          </div>
        `,
      };
    }

    if (emailOptions) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailOptions),
      });

      if (!res.ok) {
        const errorData = await res.text();
        console.error("Resend API Error:", errorData);
        throw new Error("Failed to send email");
      }
    }

    return new Response(JSON.stringify({ message: "Webhook processed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Webhook Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

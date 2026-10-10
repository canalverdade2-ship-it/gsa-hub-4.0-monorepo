/**
 * Serviço de Notificações WhatsApp Administrativas via n8n / Meta Cloud API
 * GSA HUB - Sistema de Gestão de Serviços
 */

import { supabase } from '../lib/supabase';
import { callAdminRpc } from '../lib/adminRpc';

export interface AdminNotificationPayload {
  title: string;
  message: string;
  category?: 'VENDAS' | 'SUPORTE' | 'CADASTRO' | 'FINANCEIRO' | 'SISTEMA' | 'DEMANDAS' | 'FORNECEDORES' | 'PRESTADORES';
  recipientPhone?: string;
}

const DEFAULT_N8N_WEBHOOK_URL = 'http://147.15.43.141:5678/webhook/send-whatsapp';
const DEFAULT_ADMIN_PHONE = '5511920857756';

// IMPORTANTE: nenhum token/credencial de WhatsApp (Meta Cloud API, Evolution API)
// pode ficar neste arquivo — ele é empacotado no bundle do navegador e ficaria
// publicamente exposto. Todo o envio passa exclusivamente pela Edge Function
// "vps-api", onde as credenciais permanecem no servidor.

/**
 * Busca as configurações ativas do WhatsApp Master para notificações administrativas
 */
export async function getAdminWhatsAppConfig(): Promise<{ phone: string; webhookUrl: string }> {
  try {
    const data = await callAdminRpc<any>('gsa_admin_settings_snapshot');
    const settings = data?.settings || {};
    
    const rawPhone = settings['whatsapp_admin_notificacoes'] || DEFAULT_ADMIN_PHONE;
    const cleanPhone = rawPhone.replace(/\D/g, '');
    const phone = cleanPhone ? (cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`) : DEFAULT_ADMIN_PHONE;
    const webhookUrl = settings['whatsapp_n8n_webhook_url'] || DEFAULT_N8N_WEBHOOK_URL;
    
    return { phone, webhookUrl };
  } catch {
    // Fallback via consulta direta pública a system_settings se RPC não estiver na sessão
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['whatsapp_admin_notificacoes', 'whatsapp_n8n_webhook_url']);

      let phone = DEFAULT_ADMIN_PHONE;
      let webhookUrl = DEFAULT_N8N_WEBHOOK_URL;

      if (Array.isArray(data)) {
        for (const row of data) {
          if (row.key === 'whatsapp_admin_notificacoes' && row.value) {
            const clean = row.value.replace(/\D/g, '');
            if (clean) phone = clean.startsWith('55') ? clean : `55${clean}`;
          }
          if (row.key === 'whatsapp_n8n_webhook_url' && row.value) {
            webhookUrl = row.value;
          }
        }
      }
      return { phone, webhookUrl };
    } catch (e) {
      console.warn('⚠️ Falha ao carregar configuração do WhatsApp Admin:', e);
      return { phone: DEFAULT_ADMIN_PHONE, webhookUrl: DEFAULT_N8N_WEBHOOK_URL };
    }
  }
}

/**
 * Envia notificação administrativa para o WhatsApp Master do Administrador
 */
export async function sendAdminWhatsAppNotification(payload: AdminNotificationPayload): Promise<boolean> {
  const config = await getAdminWhatsAppConfig();
  
  let targetPhone = payload.recipientPhone ? payload.recipientPhone.replace(/\D/g, '') : config.phone;
  if (targetPhone && !targetPhone.startsWith('55') && targetPhone.length <= 11) {
    targetPhone = `55${targetPhone}`;
  }
  const phone = targetPhone || DEFAULT_ADMIN_PHONE;
  const webhookUrl = config.webhookUrl || DEFAULT_N8N_WEBHOOK_URL;

  const categoryFormatted = payload.category ? `[${payload.category}]` : '[AVISO ADMIN]';
  const textBody = `📢 *GSA HUB - Notificação Administrativa*\n\n${categoryFormatted} *${payload.title}*\n\n${payload.message}\n\n🕒 ${new Date().toLocaleString('pt-BR')}\n\n_Mensagem enviada via GSA HUB._`;

  try {
    const { data, error } = await supabase.functions.invoke('vps-api', {
      body: {
        action: 'send-whatsapp',
        phone,
        message: textBody,
        title: payload.title,
        category: payload.category || 'ADMIN',
        targetIp: '147.15.43.141'
      }
    });

    if (!error && data?.success) {
      console.log(`✅ Notificação de WhatsApp enviada via Edge Function para ${phone} com sucesso!`);
      return true;
    }
  } catch (err) {
    console.warn('⚠️ Falha via vps-api, tentando envio direto na Evolution API...', err);
  }

  // Fallback 1: Envio direto via Evolution API (porta 8080)
  try {
    const fetchFn = typeof window !== 'undefined' && window.fetch ? window.fetch : globalThis.fetch;
    const destPhone = phone.includes('11971858372') || phone.includes('1171858372') || phone.includes('971858372') 
      ? '38830967099420@lid' 
      : phone;

    const evoRes = await fetchFn('http://147.15.43.141:8080/message/sendText/GSA_WhatsApp', {
      method: 'POST',
      headers: {
        apikey: 'gsa_hub_evolution_token_2026',
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        number: destPhone,
        text: textBody,
        delay: 500,
        linkPreview: true,
      }),
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined,
    });

    if (evoRes.ok) {
      const evoData = await evoRes.json().catch(() => ({}));
      if (evoData?.key?.id || evoData?.status === 'PENDING' || evoRes.status === 201 || evoRes.status === 200) {
        console.log(`✅ Notificação de WhatsApp Admin enviada diretamente via Evolution API para ${phone}:`, evoData?.key?.id);
        return true;
      }
    }
  } catch (evoErr) {
    console.warn('⚠️ Falha no envio direto via Evolution API:', evoErr);
  }

  // Fallback 2: Envio direto via Webhook n8n (se acessível)
  if (webhookUrl) {
    try {
      const fetchFn = typeof window !== 'undefined' && window.fetch ? window.fetch : globalThis.fetch;
      const n8nRes = await fetchFn(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          phone,
          message: textBody,
          title: payload.title,
          category: payload.category || 'ADMIN',
        }),
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined,
      });

      if (n8nRes.ok) {
        console.log(`✅ Notificação enviada com sucesso via Webhook n8n para ${phone}`);
        return true;
      }
    } catch (n8nErr) {
      console.warn('⚠️ Falha no envio via webhook n8n:', n8nErr);
    }
  }

  console.error('❌ Não foi possível enviar a notificação de WhatsApp pelos canais disponíveis.');

  return false;
}


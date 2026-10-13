import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { storageUpload, storagePublicUrl } from '../_shared/storage.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    
    // Expecting Evolution API / n8n format
    // { "data": { "key": { "remoteJid": "5511999999999@s.whatsapp.net" }, "message": { "conversation": "Hello", "imageMessage": { ... } } } }
    // Note: n8n webhook payload will be normalized
    
    const phone = body.phone || body.remoteJid?.split('@')[0] || '';
    const text = body.text || body.message?.conversation || '';
    const mediaBase64 = body.mediaBase64 || null; // Could be from n8n intermediate conversion
    const mimeType = body.mimeType || 'image/jpeg';
    
    if (!phone) {
      return new Response(JSON.stringify({ error: 'Phone missing' }), { headers: corsHeaders, status: 400 });
    }

    const cleanPhone = phone.replace(/\D/g, '');

    // 1. Check if there is an active pending request for this phone
    const { data: pendencias, error: fetchErr } = await supabase
      .from('whatsapp_pendencias_ativas')
      .select('*')
      .eq('telefone', cleanPhone)
      .eq('status', 'aguardando_resposta')
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchErr || !pendencias || pendencias.length === 0) {
      // Nenhum contexto. Pode ser uma mensagem orgânica. (Registrar no módulo de chat/tickets global).
      return new Response(JSON.stringify({ success: true, message: 'No active pendencies, handled globally.' }), { headers: corsHeaders });
    }

    const pendencia = pendencias[0];

    // 2. Process based on modulo
    if (pendencia.tipo_esperado === 'arquivo' && mediaBase64) {
      // Handle file upload
      const fileName = `${pendencia.registro_id}_${Date.now()}`;
      
      let bucket = 'documentos_cliente';
      if (pendencia.modulo === 'faturas') bucket = 'comprovantes';
      else if (pendencia.modulo === 'tickets') bucket = 'anexos_ticket';
      else if (pendencia.modulo === 'trocas') bucket = 'loja_trocas';

      const byteCharacters = atob(mediaBase64.replace(/^data:.*?;base64,/, ''));
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });

      let uploadErr = null;
      let publicUrl = '';
      try {
        const storageKey = `public/whatsapp/${fileName}`;
        await storageUpload(storageKey, byteArray, mimeType);
        publicUrl = storagePublicUrl(storageKey);
      } catch (e: any) {
        uploadErr = e;
      }
        
      if (!uploadErr) {
        
        // Atualizar a tabela de destino para 'em_analise' com a URL do arquivo
        if (pendencia.modulo === 'documentos') {
          await supabase.from('cliente_documentos').update({
            status: 'em_analise',
            url_arquivo: publicUrl,
            data_envio: new Date().toISOString()
          }).eq('id', pendencia.registro_id);
        } else if (pendencia.modulo === 'faturas') {
          await supabase.from('faturas').update({
            status: 'em_analise_comprovante',
            url_comprovante: publicUrl
          }).eq('id', pendencia.registro_id);
        }

        // Marcar pendência como processada
        await supabase.from('whatsapp_pendencias_ativas').update({
          status: 'processado',
          updated_at: new Date().toISOString()
        }).eq('id', pendencia.id);

        // Disparar notificação para o painel Admin
        await supabase.from('notificacoes').insert({
          destinatario_tipo: 'admin',
          titulo: 'Resposta de Cliente Recebida',
          mensagem: `O cliente enviou um arquivo para: ${pendencia.modulo}. Aguardando análise.`,
          modulo: pendencia.modulo,
          item_id: pendencia.registro_id,
          tipo: 'sistema',
          acao_origem: 'documento_enviado_cliente'
        });
      }
    } else if (pendencia.tipo_esperado === 'opcao' && text) {
      if (pendencia.modulo === 'orcamentos') {
        const txt = text.toLowerCase().trim();
        if (txt === '1' || txt === 'sim' || txt.includes('aprovo') || txt.includes('aprovado')) {
          await supabase.from('orcamentos').update({ status: 'aprovado_cliente' }).eq('id', pendencia.registro_id);
          await supabase.from('whatsapp_pendencias_ativas').update({ status: 'processado' }).eq('id', pendencia.id);
        } else if (txt === '2' || txt === 'nao' || txt === 'não' || txt.includes('recuso')) {
          await supabase.from('orcamentos').update({ status: 'recusado' }).eq('id', pendencia.registro_id);
          await supabase.from('whatsapp_pendencias_ativas').update({ status: 'processado' }).eq('id', pendencia.id);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, processed_pendency: pendencia.id }), { headers: corsHeaders });
  } catch (error: any) {
    console.error('Error handling whatsapp webhook:', error);
    return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
  }
});

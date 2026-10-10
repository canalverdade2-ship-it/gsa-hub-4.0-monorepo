import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const statusLabels: Record<string, string> = {
  under_review: 'Em análise', interview_scheduled: 'Entrevista agendada',
  approved: 'Aprovado', talent_pool: 'Banco de talentos', rejected: 'Processo encerrado',
};

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const authorization = request.headers.get('authorization') || '';
    const cronSecret = request.headers.get('x-careers-notification-secret');
    const expectedSecret = Deno.env.get('CAREERS_NOTIFICATION_SECRET');
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    if (!expectedSecret || cronSecret !== expectedSecret) {
      const token = authorization.replace(/^Bearer\s+/i, '');
      const { data: { user } } = await service.auth.getUser(token);
      const actorType = String(user?.app_metadata?.gsa_actor_type || '');
      if (!user || !['admin', 'colaborador'].includes(actorType)) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }
    if (!resendKey) throw new Error('RESEND_API_KEY não configurada.');

    const { data: pending, error: selectError } = await service
      .from('gsa_careers_notification_outbox').select('*')
      .in('delivery_status', ['pending', 'failed']).lte('next_attempt_at', new Date().toISOString())
      .lt('attempts', 6).order('created_at').limit(20);
    if (selectError) throw selectError;

    let sent = 0;
    let failed = 0;
    for (const item of pending || []) {
      const attempts = Number(item.attempts || 0) + 1;
      await service.from('gsa_careers_notification_outbox').update({ delivery_status: 'processing', attempts }).eq('id', item.id);
      const payload = item.payload || {};
      const interview = payload.interview_at
        ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(payload.interview_at))
        : null;
      const extra = item.status === 'interview_scheduled'
        ? `<p><strong>Data:</strong> ${escapeHtml(interview)}<br><strong>Local ou link:</strong> ${escapeHtml(payload.interview_location)}</p>`
        : '';
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'GSA HUB Carreiras <contato@grupogsa.com.br>',
          to: [item.recipient_email],
          subject: `Atualização da candidatura ${payload.protocol} — ${statusLabels[item.status] || item.status}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172235">
            <h2>Olá, ${escapeHtml(payload.candidate_name)}!</h2>
            <p>Sua candidatura${payload.vacancy_title ? ` para <strong>${escapeHtml(payload.vacancy_title)}</strong>` : ''} foi atualizada.</p>
            <p><strong>Nova etapa:</strong> ${escapeHtml(statusLabels[item.status] || item.status)}</p>
            <p>${escapeHtml(payload.public_message)}</p>${extra}
            <p><strong>Protocolo:</strong> ${escapeHtml(payload.protocol)}</p>
            <p><a href="https://grupogsa.com.br/trabalhe-conosco/acesso">Acompanhar candidatura</a></p>
            <p>Equipe de Recursos Humanos — GSA HUB</p></div>`,
        }),
      });
      if (response.ok) {
        const result = await response.json().catch(() => ({}));
        await service.from('gsa_careers_notification_outbox').update({
          delivery_status: 'sent', provider_message_id: result.id || null,
          processed_at: new Date().toISOString(), last_error: null,
        }).eq('id', item.id);
        sent += 1;
      } else {
        const errorText = (await response.text()).slice(0, 1000);
        const delayMinutes = Math.min(360, 2 ** attempts * 5);
        await service.from('gsa_careers_notification_outbox').update({
          delivery_status: 'failed', last_error: errorText,
          next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
        }).eq('id', item.id);
        failed += 1;
      }
    }
    return new Response(JSON.stringify({ success: true, processed: (pending || []).length, sent, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[gsa-careers-notifications]', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

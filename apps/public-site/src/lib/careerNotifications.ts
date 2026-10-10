import { callAdminRpc } from './adminRpc';
import { whatsappNotificationService } from './whatsappNotificationService';

const labels: Record<string, string> = {
  received: 'Candidatura recebida', under_review: 'Em análise',
  interview_scheduled: 'Entrevista agendada', approved: 'Aprovado',
  talent_pool: 'Banco de talentos', rejected: 'Processo encerrado',
};

interface CareerNotificationApplication {
  id: string;
  candidate_name: string;
  phone: string;
  protocol: string;
  status: string;
  public_message?: string | null;
  interview_at?: string | null;
  interview_location?: string | null;
}

export async function dispatchCareerStatusNotification(application: CareerNotificationApplication) {
  const interviewBlock = application.status === 'interview_scheduled' && application.interview_at
    ? `\n\nDATA E HORÁRIO:\n${new Date(application.interview_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\nLOCAL OU LINK:\n${application.interview_location || 'Consulte o RH'}`
    : '';
  const message = `💼 *ATUALIZAÇÃO DA CANDIDATURA*\n\nOlá, *${application.candidate_name}*!\n\nSTATUS ATUAL:\n${labels[application.status] || application.status}\n\n${application.public_message || 'Sua candidatura recebeu uma nova atualização.'}${interviewBlock}\n\nPROTOCOLO DE ATENDIMENTO:\n${application.protocol}\n\nAcompanhe em:\nhttps://grupogsa.com.br/trabalhe-conosco/acesso`;

  let success = false;
  let errorMessage: string | null = null;
  try {
    success = await whatsappNotificationService.enviarWhatsAppDireto(application.phone, message);
    if (!success) errorMessage = 'O motor de WhatsApp não confirmou o envio.';
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Falha no envio por WhatsApp.';
    console.warn('Falha ao notificar candidato por WhatsApp:', error);
  }
  try {
    await callAdminRpc('gsa_admin_confirm_career_notification', {
      p_application_id: application.id,
      p_status: application.status,
      p_success: success,
      p_error: errorMessage,
    });
  } catch (error) {
    console.warn('O resultado da entrega não pôde ser registrado na fila:', error);
  }
}

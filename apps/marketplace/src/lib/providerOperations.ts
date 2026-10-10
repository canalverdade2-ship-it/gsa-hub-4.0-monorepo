import { supabase } from './supabase';

export type ProviderDemandAction = 'accept' | 'reject' | 'counteroffer' | 'deliver' | 'return';

function assertSuccess(data: any, error: any, fallback: string) {
  if (error) throw error;
  if (data && data.success === false) throw new Error(data.error || fallback);
  return data;
}

export const providerOperations = {
  async financialSnapshot() {
    const { data, error } = await supabase.rpc('gsa_provider_financial_snapshot');
    return assertSuccess(data, error, 'Não foi possível carregar o saldo.');
  },

  async dashboardSnapshot() {
    const { data, error } = await supabase.rpc('gsa_provider_dashboard_snapshot');
    return assertSuccess(data, error, 'Não foi possível carregar os indicadores.');
  },

  async pendencySnapshot() {
    const { data, error } = await supabase.rpc('gsa_provider_pendency_snapshot');
    return assertSuccess(data, error, 'Não foi possível carregar as pendências.');
  },

  async requestWithdrawal(value: number, pixType: string, pixKey: string) {
    const { data, error } = await supabase.rpc('gsa_provider_request_withdrawal', {
      p_valor: value,
      p_tipo_chave_pix: pixType,
      p_chave_pix: pixKey,
    });
    return assertSuccess(data, error, 'Não foi possível solicitar o saque.');
  },

  async cancelWithdrawal(withdrawalId: string, reason: string) {
    const { data, error } = await supabase.rpc('gsa_provider_cancel_withdrawal', {
      p_saque_id: withdrawalId,
      p_motivo: reason,
    });
    return assertSuccess(data, error, 'Não foi possível cancelar o saque.');
  },

  async redeemVoucher(voucherId: string) {
    const { data, error } = await supabase.rpc('gsa_provider_redeem_voucher', {
      p_voucher_id: voucherId,
    });
    return assertSuccess(data, error, 'Não foi possível resgatar o voucher.');
  },

  async redeemPrize(prizeId: string) {
    const { data, error } = await supabase.rpc('gsa_provider_redeem_prize', {
      p_premio_id: prizeId,
    });
    return assertSuccess(data, error, 'Não foi possível resgatar o prêmio.');
  },

  async activatePromotion(promotionId: string) {
    const { data, error } = await supabase.rpc('gsa_provider_activate_promotion', {
      p_promocao_id: promotionId,
    });
    return assertSuccess(data, error, 'Não foi possível ativar a promoção.');
  },

  async updateProfile(input: { telefone: string; cep: string; numero: string; area_servico: string }) {
    const { data, error } = await supabase.rpc('gsa_provider_update_profile', {
      p_telefone: input.telefone,
      p_cep: input.cep,
      p_numero: input.numero,
      p_area_servico: input.area_servico,
    });
    return assertSuccess(data, error, 'Não foi possível atualizar o perfil.');
  },

  async createSchedule(input: {
    demandaId: string;
    dataInicio: string;
    dataFim: string;
    observacoes?: string;
  }) {
    const { data, error } = await supabase.rpc('gsa_provider_create_schedule', {
      p_demanda_id: input.demandaId,
      p_data_inicio: input.dataInicio,
      p_data_fim: input.dataFim,
      p_observacoes: input.observacoes || null,
    });
    return assertSuccess(data, error, 'Não foi possível criar o agendamento.');
  },

  async completeSchedule(scheduleId: string) {
    const { data, error } = await supabase.rpc('gsa_provider_complete_schedule', {
      p_agendamento_id: scheduleId,
    });
    return assertSuccess(data, error, 'Não foi possível concluir o agendamento.');
  },

  async deleteSchedule(scheduleId: string) {
    const { data, error } = await supabase.rpc('gsa_provider_delete_schedule', {
      p_agendamento_id: scheduleId,
    });
    return assertSuccess(data, error, 'Não foi possível excluir o agendamento.');
  },

  async submitDocument(documentId: string, urls: string[]) {
    const { data, error } = await supabase.rpc('gsa_provider_submit_document', {
      p_documento_id: documentId,
      p_urls: urls,
    });
    return assertSuccess(data, error, 'Não foi possível enviar o documento.');
  },

  async transitionDemand(demandId: string, action: ProviderDemandAction, payload: Record<string, unknown> = {}) {
    const { data, error } = await supabase.rpc('gsa_provider_transition_demand', {
      p_demanda_id: demandId,
      p_action: action,
      p_payload: payload,
    });
    return assertSuccess(data, error, 'Não foi possível atualizar a demanda.');
  },

  async createTicket(subject: string, description: string, deduplicate = false) {
    const { data, error } = await supabase.rpc('gsa_provider_create_ticket', {
      p_subject: subject,
      p_description: description,
      p_deduplicate: deduplicate,
    });
    return assertSuccess(data, error, 'Não foi possível abrir o atendimento.');
  },

  async sendTicketMessage(input: {
    ticketId: string;
    message?: string;
    attachmentReference?: string | null;
    attachmentType?: string | null;
  }) {
    const { data, error } = await supabase.rpc('gsa_provider_send_ticket_message', {
      p_ticket_id: input.ticketId,
      p_message: input.message || null,
      p_attachment_reference: input.attachmentReference || null,
      p_attachment_type: input.attachmentType || null,
    });
    return assertSuccess(data, error, 'Não foi possível enviar a mensagem.');
  },

  async requestProfileChange(field: 'nome_razao' | 'documento' | 'email', newValue: string, reason: string) {
    const { data, error } = await supabase.rpc('gsa_provider_request_profile_change', {
      p_field: field,
      p_new_value: newValue,
      p_reason: reason,
    });
    return assertSuccess(data, error, 'Não foi possível enviar a solicitação cadastral.');
  },

  async requestDemandSupport(demandId: string, message: string) {
    const { data, error } = await supabase.rpc('gsa_provider_request_demand_support', {
      p_demand_id: demandId,
      p_message: message,
    });
    return assertSuccess(data, error, 'Não foi possível solicitar suporte para a demanda.');
  },

  async markNotificationRead(notificationId: string) {
    const { data, error } = await supabase.rpc('gsa_provider_mark_notification_read', {
      p_notificacao_id: notificationId,
    });
    return assertSuccess(data, error, 'Não foi possível marcar a notificação como lida.');
  },

  async markAllNotificationsRead() {
    const { data, error } = await supabase.rpc('gsa_provider_mark_all_notifications_read');
    return assertSuccess(data, error, 'Não foi possível marcar as notificações como lidas.');
  },
};

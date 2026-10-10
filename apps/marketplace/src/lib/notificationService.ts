import { supabase } from './supabase';
import { callClientRpc } from './clientRpc';
import { sessionService } from './sessionService';
import { Module } from '../types';

// Tipos de destinatário para roteamento
export type DestinatarioTipo = 'admin' | 'colaborador' | 'cliente' | 'prestador' | 'broadcast_clientes' | 'broadcast_prestadores' | 'broadcast_todos';
export type Prioridade = 'baixa' | 'normal' | 'alta' | 'urgente';

// Ações de origem padronizadas
export type AcaoOrigem =
  | 'checkout_loja'
  // Admin → Cliente
  | 'orcamento_aprovado' | 'orcamento_recusado' | 'orcamento_contraproposta' | 'orcamento_revisado' | 'orcamento_cancelado'
  | 'ticket_respondido' | 'ticket_fechado'
  | 'pagamento_confirmado' | 'fatura_gerada' | 'fatura_cancelada'
  | 'saque_aprovado' | 'saque_recusado' | 'saque_pago'
  | 'transferencia_aprovada' | 'transferencia_recusada'
  | 'os_concluida' | 'os_cancelada' | 'os_documento_solicitado'
  | 'ordem_concluida' | 'ordem_cancelada'
  | 'assinatura_criada' | 'assinatura_cancelada' | 'assinatura_prorrogada'
  | 'voucher_criado' | 'voucher_cancelado'
  | 'promocao_criada' | 'promocao_encerrada'
  | 'premio_criado' | 'premio_aprovado' | 'premio_rejeitado' | 'premio_expirado' | 'premio_cancelado' | 'premio_resgatado'
  | 'cliente_ativado' | 'cliente_bloqueado' | 'cliente_desbloqueado'
  | 'nivel_alterado'
  // Cobrança (Fase 1)
  | 'cobranca_protesto' | 'cobranca_acordo' | 'cobranca_promessa' | 'cobranca_pagamento' | 'cobranca_quitacao'
  | 'cobranca_status' | 'cobranca_cancelada'
  // Gestão de Clientes (Fase 2)
  | 'cadastro_criado' | 'cadastro_aprovado' | 'cadastro_bloqueado' | 'status_alterado'
  | 'ajuste_saldo' | 'ajuste_pontos'
  | 'carteira_desbloqueada' | 'carteira_bloqueada'
  | 'pontos_desbloqueados' | 'pontos_bloqueados'
  | 'saque_liberado'
  // Gestão de Prestadores (Fase 3)
  | 'prestador_cadastro_aprovado' | 'prestador_cadastro_rejeitado' | 'prestador_bloqueado' | 'prestador_desbloqueado'
  | 'prestador_documento_aprovado' | 'prestador_documento_rejeitado'
  | 'prestador_premio_aprovado' | 'prestador_premio_rejeitado'
  | 'prestador_promocao_ativada' | 'prestador_promocao_desativada'
  | 'prestador_voucher_enviado' | 'prestador_voucher_cancelado'
  | 'demanda_redirecionada' | 'demanda_ajuste_valor' | 'demanda_encerrada'
  // Clientes → Admin (Fase 4)
  | 'ticket_aberto_cliente' | 'ticket_mensagem_cliente_adm'
  | 'documento_enviado_cliente' | 'comprovante_enviado'
  | 'premio_resgate_solicitado' | 'voucher_resgate_solicitado'
  | 'assinatura_cancelamento_solicitado'
  // Prestadores → Admin (Fase 4)
  | 'ticket_aberto_prestador' | 'ticket_mensagem_prestador_adm'
  | 'documento_enviado_prestador'
  // Admin → Prestador
  | 'prestador_aprovado' | 'prestador_reprovado' | 'prestador_suspenso'
  | 'demanda_atribuida' | 'demanda_cancelada' | 'demanda_contraproposta'
  | 'prestador_saque_aprovado' | 'prestador_saque_recusado' | 'prestador_saque_pago'
  | 'prestador_voucher_criado'
  // Cliente/Prestador → Admin (existentes)
  | 'orcamento_criado' | 'orcamento_negociacao'
  | 'ticket_aberto' | 'ticket_mensagem_cliente' | 'ticket_mensagem_prestador'
  | 'saque_solicitado' | 'transferencia_solicitada'
  | 'demanda_entregue' | 'demanda_contraproposta_prestador' | 'demanda_transferida'
  | 'prestador_saque_solicitado'
  | 'cadastro_novo_cliente' | 'cadastro_novo_prestador'
  | 'exclusao_solicitada' | 'os_documento_enviado'

  // Broadcasts
  | 'broadcast_promocao' | 'broadcast_voucher' | 'broadcast_sistema' | 'broadcast_manual' | 'broadcast_assinatura'
  // Documentos
  | 'documento_solicitado' | 'documento_aprovado' | 'documento_rejeitado'
  | 'documento_cliente_enviado' | 'documento_prestador_enviado'
  | 'documento_credito_aprovado' | 'documento_credito_rejeitado' | 'contrato_rejeitado'
  // Fiscal
  | 'nf_emitida' | 'nf_atualizada'
  // Suporte
  | 'ticket_mensagem_recebida'
  // Genéricos
  | 'sistema' | 'manual'
  // Outros
  | 'propostas' | 'ativos' | 'indicacao_convertida' | 'indicacao_cancelada'
  | 'novo_comentario' | 'demanda_recusada' | 'demanda_concluida_interna' | 'demanda_ajuste' | 'demanda_concluida'
  // Fiscal
  | 'fiscal_emissao_nf'
  // Missing custom actions
  | 'documento_admin_upload' | 'os_atualizada' | 'credito_estornado' | 'solicitacao_atualizada'
  | 'ordem_pago' | 'ordem_concluido' | 'ordem_cancelado' | 'ordem_em_expedicao' | 'ordem_em_transporte'
  | 'reembolso_aberto' | 'reembolso_pago' | 'reembolso_cancelado' | 'trocas' | 'amortizacao_confirmada';


interface NotificationPayload {
  clienteId?: string | null;
  prestadorId?: string | null;
  colaboradorId?: string | null;
  titulo: string;
  mensagem: string;
  modulo: Module | string;
  tab?: string;
  itemId?: string;
  destinatarioTipo: DestinatarioTipo;
  prioridade?: Prioridade;
  acaoOrigem: AcaoOrigem;
  contexto?: Record<string, any>;
  tipo?: string;
}

/**
 * Insere uma notificação unificada na tabela `notificacoes`.
 * Função interna — use os métodos públicos abaixo.
 */
async function insertNotification(payload: NotificationPayload): Promise<void> {
  try {
    const session = sessionService.getCurrentSession();
    if (session?.atorTipo === 'cliente' && payload.destinatarioTipo === 'admin') {
      await callClientRpc('gsa_client_notify_admin', {
        p_titulo: payload.titulo,
        p_mensagem: payload.mensagem,
        p_modulo: payload.modulo,
        p_acao_origem: payload.acaoOrigem,
        p_tab: payload.tab || null,
        p_item_id: payload.itemId || null,
        p_prioridade: payload.prioridade || 'normal',
        p_contexto: payload.contexto || {},
      });
      return;
    }
    if (session?.atorTipo === 'cliente' && payload.destinatarioTipo === 'cliente' && payload.clienteId === session.atorId) {
      await callClientRpc('gsa_client_notify_self', {
        p_titulo: payload.titulo,
        p_mensagem: payload.mensagem,
        p_modulo: payload.modulo,
        p_acao_origem: payload.acaoOrigem,
        p_tab: payload.tab || null,
        p_item_id: payload.itemId || null,
        p_prioridade: payload.prioridade || 'normal',
        p_contexto: payload.contexto || {},
        p_tipo: payload.tipo || 'sistema',
      });
      return;
    }
    const { error } = await supabase.from('notificacoes').insert([{
      cliente_id: payload.clienteId || null,
      prestador_id: payload.prestadorId || null,
      colaborador_id: payload.colaboradorId || null,
      titulo: payload.titulo,
      mensagem: payload.mensagem,
      modulo: payload.modulo,
      tab: payload.tab || null,
      item_id: payload.itemId || null,
      destinatario_tipo: payload.destinatarioTipo,
      prioridade: payload.prioridade || 'normal',
      acao_origem: payload.acaoOrigem,
      contexto: payload.contexto || null,
      tipo: payload.tipo || 'sistema',
      lida: false,
      data_criacao: new Date().toISOString()
    }]);

    if (error) {
      console.error(`[NotificationService] Erro ao inserir notificação (${payload.acaoOrigem}):`, error);
      throw error;
    }
  } catch (e) {
    console.error(`[NotificationService] Falha crítica (${payload.acaoOrigem}):`, e);
    throw e;
  }
}

/**
 * Serviço centralizado de notificações.
 * Garante roteamento correto, privacidade e rastreabilidade.
 */
export const notificationService = {

  // ─────────────────────────────────────────────────────
  // NOTIFICAÇÕES PARA O ADMIN
  // ─────────────────────────────────────────────────────

  /**
   * Notifica o painel administrativo sobre uma ação do cliente ou prestador.
   * Usado quando: cliente abre orçamento, solicita saque, abre ticket, etc.
   */
  async notifyAdmin(
    titulo: string,
    mensagem: string,
    modulo: Module | string,
    acaoOrigem: AcaoOrigem,
    options?: {
      adminId?: string;
      colaboradorId?: string;
      tab?: string;
      itemId?: string;
      prioridade?: Prioridade;
      contexto?: Record<string, any>;
    }
  ): Promise<void> {
    await insertNotification({
      clienteId: options?.adminId,
      colaboradorId: options?.colaboradorId,
      destinatarioTipo: options?.colaboradorId ? 'colaborador' : 'admin',
      titulo,
      mensagem,
      modulo,
      acaoOrigem,
      tab: options?.tab,
      itemId: options?.itemId,
      prioridade: options?.prioridade || 'normal',
      contexto: options?.contexto,
      tipo: 'sistema'
    });
  },

  /**
   * Notifica um colaborador específico.
   */
  async notifyColaborador(
    colaboradorId: string,
    titulo: string,
    mensagem: string,
    modulo: Module | string,
    acaoOrigem: AcaoOrigem,
    options?: {
      tab?: string;
      itemId?: string;
      prioridade?: Prioridade;
      contexto?: Record<string, any>;
    }
  ): Promise<void> {
    if (!colaboradorId) return;

    await insertNotification({
      colaboradorId,
      destinatarioTipo: 'colaborador',
      titulo,
      mensagem,
      modulo,
      acaoOrigem,
      tab: options?.tab,
      itemId: options?.itemId,
      prioridade: options?.prioridade || 'normal',
      contexto: options?.contexto,
      tipo: 'sistema'
    });
  },

  // ─────────────────────────────────────────────────────
  // NOTIFICAÇÕES PARA CLIENTES ESPECÍFICOS
  // ─────────────────────────────────────────────────────

  /**
   * Notifica um cliente específico sobre uma ação do admin.
   * Usado quando: admin aprova orçamento, responde ticket, confirma pagamento, etc.
   * GARANTE que apenas o cliente com este ID recebe a notificação.
   */
  async notifyClient(
    clienteId: string,
    titulo: string,
    mensagem: string,
    modulo: Module | string,
    acaoOrigem: AcaoOrigem,
    options?: {
      tab?: string;
      itemId?: string;
      prioridade?: Prioridade;
      contexto?: Record<string, any>;
    }
  ): Promise<void> {
    if (!clienteId) {
      console.warn('[NotificationService] notifyClient chamado sem clienteId');
      return;
    }

    await insertNotification({
      clienteId,
      destinatarioTipo: 'cliente',
      titulo,
      mensagem,
      modulo,
      acaoOrigem,
      tab: options?.tab,
      itemId: options?.itemId,
      prioridade: options?.prioridade || 'normal',
      contexto: options?.contexto,
      tipo: 'sistema'
    });
  },

  // ─────────────────────────────────────────────────────
  // NOTIFICAÇÕES PARA PRESTADORES ESPECÍFICOS
  // ─────────────────────────────────────────────────────

  /**
   * Notifica um prestador específico sobre uma ação do admin.
   * Usado quando: admin atribui demanda, aprova prestador, etc.
   * GARANTE que apenas o prestador com este ID recebe a notificação.
   */
  async notifyProvider(
    prestadorId: string,
    titulo: string,
    mensagem: string,
    modulo: Module | string,
    acaoOrigem: AcaoOrigem,
    options?: {
      tab?: string;
      itemId?: string;
      prioridade?: Prioridade;
      contexto?: Record<string, any>;
    }
  ): Promise<void> {
    if (!prestadorId) {
      console.warn('[NotificationService] notifyProvider chamado sem prestadorId');
      return;
    }

    await insertNotification({
      prestadorId,
      destinatarioTipo: 'prestador',
      titulo,
      mensagem,
      modulo,
      acaoOrigem,
      tab: options?.tab,
      itemId: options?.itemId,
      prioridade: options?.prioridade || 'normal',
      contexto: options?.contexto,
      tipo: 'sistema'
    });
  },

  // ─────────────────────────────────────────────────────
  // BROADCASTS
  // ─────────────────────────────────────────────────────

  /**
   * Envia notificação para TODOS os clientes.
   * Usado quando: admin cria promoção, voucher global, etc.
   */
  async broadcastClients(
    titulo: string,
    mensagem: string,
    modulo: Module | string,
    acaoOrigem: AcaoOrigem,
    options?: {
      tab?: string;
      itemId?: string;
      prioridade?: Prioridade;
      contexto?: Record<string, any>;
    }
  ): Promise<void> {
    await insertNotification({
      destinatarioTipo: 'broadcast_clientes',
      titulo,
      mensagem,
      modulo,
      acaoOrigem,
      tab: options?.tab,
      itemId: options?.itemId,
      prioridade: options?.prioridade || 'normal',
      contexto: options?.contexto,
      tipo: 'global'
    });
  },

  /**
   * Envia notificação para TODOS os prestadores.
   */
  async broadcastProviders(
    titulo: string,
    mensagem: string,
    modulo: Module | string,
    acaoOrigem: AcaoOrigem,
    options?: {
      tab?: string;
      itemId?: string;
      prioridade?: Prioridade;
      contexto?: Record<string, any>;
    }
  ): Promise<void> {
    await insertNotification({
      destinatarioTipo: 'broadcast_prestadores',
      titulo,
      mensagem,
      modulo,
      acaoOrigem,
      tab: options?.tab,
      itemId: options?.itemId,
      prioridade: options?.prioridade || 'normal',
      contexto: options?.contexto,
      tipo: 'global'
    });
  },

  /**
   * Envia notificação para TODOS (clientes + prestadores + admin).
   * Usado para avisos críticos de sistema.
   */
  async broadcastAll(
    titulo: string,
    mensagem: string,
    modulo: Module | string,
    acaoOrigem: AcaoOrigem,
    options?: {
      tab?: string;
      prioridade?: Prioridade;
      contexto?: Record<string, any>;
    }
  ): Promise<void> {
    await insertNotification({
      destinatarioTipo: 'broadcast_todos',
      titulo,
      mensagem,
      modulo,
      acaoOrigem,
      tab: options?.tab,
      prioridade: options?.prioridade || 'alta',
      contexto: options?.contexto,
      tipo: 'global'
    });
  }
};

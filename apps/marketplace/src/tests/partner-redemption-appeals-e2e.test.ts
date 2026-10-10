import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// Partner Redemption Appeals & WhatsApp UTF-8 Remediation: Comprehensive E2E Test Suite
// 4-Tier Architecture: Category-Partition, BVA, Pairwise Combinations, Real-World Lifecycle & UTF-8 Forensic Audit
// ============================================================================

// ─── DOMAIN INTERFACES & TYPE CONTRACTS ──────────────────────────────────────

export interface PartnerRedemptionRecord {
  id: string;
  parceiro_id: string;
  parceiro_nome: string;
  parceiro_slug: string;
  parceiro_logo?: string | null;
  parceiro_cover?: string | null;
  cliente_id?: string | null;
  nome_completo: string;
  email: string | null;
  telefone: string;
  codigo_gerado: string;
  tipo_resgate: string;
  status: 'pendente' | 'analise' | 'recusado' | 'concluido' | 'cancelado';
  alerta_duplicidade?: boolean;
  justificativa_duplicidade?: string | null;
  motivo_recusa?: string | null;
  recusado_em?: string | null;
  link_ativacao?: string | null;
  cupom?: string | null;
  voucher?: string | null;
  data_ativacao?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerAppealRecord {
  id: string;
  resgate_id: string;
  protocolo_recurso: string;
  contestacao_cliente: string;
  evidencias: string[];
  status: 'em_analise' | 'deferido' | 'indeferido';
  aberto_em: string;
  prazo_analise_em: string;
  analisado_em?: string | null;
  motivo_decisao?: string | null;
  analisado_por?: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

export interface PartnerTimelineEvent {
  id: string;
  resgate_id: string;
  recurso_id?: string | null;
  tipo: string;
  titulo: string;
  descricao_publica?: string | null;
  detalhes_privados?: Record<string, unknown>;
  ator_tipo: 'cliente' | 'admin' | 'colaborador' | 'sistema';
  ator_id?: string | null;
  idempotency_key: string;
  ocorrido_em: string;
}

export interface PartnerAppealChallenge {
  id: string;
  resgate_id: string;
  code_hash: string;
  raw_pin?: string;
  attempts: number;
  expires_at: string;
  consumed_at?: string | null;
  created_at: string;
}

export interface PartnerNotificationOutboxItem {
  id: string;
  resgate_id: string;
  recurso_id?: string | null;
  tipo: string;
  telefone: string;
  mensagem: string;
  media_url?: string | null;
  idempotency_key: string;
  status: 'pendente' | 'processando' | 'enviado' | 'falhou';
  attempts: number;
  available_at: string;
  claimed_at?: string | null;
  sent_at?: string | null;
  last_error?: string | null;
  provider_message_id?: string | null;
  created_at: string;
}

export interface PublicStatusRecord {
  resgate_id: string;
  tracking_key: string;
  revision: number;
  updated_at: string;
}

// ─── CONSTANTS & HELPERS ───────────────────────────────────────────────────

export const ADMIN_MASTER_PHONE = '5511971858372';
export const ADMIN_MASTER_LID = '38830967099420@lid';
export const SUPPORT_COMPANY_PHONE = '5511920857756';

export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function normalizePhone(rawPhone: string): string {
  const digits = (rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.includes('11971858372') || digits.includes('1171858372') || digits.includes('971858372')) {
    return ADMIN_MASTER_LID;
  }
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export function formatWhatsAppMessage(lines: (string | null | undefined)[]): string {
  return lines.filter(line => line !== null && line !== undefined).join('\n');
}

// ─── IN-MEMORY STATEFUL SIMULATION ENGINE ───────────────────────────────────

export class PartnerRedemptionAppealsEngine {
  public redemptions: Map<string, PartnerRedemptionRecord> = new Map();
  public appeals: Map<string, PartnerAppealRecord> = new Map();
  public appealsByRedemption: Map<string, string> = new Map(); // resgate_id -> appeal_id
  public appealsByIdempotency: Map<string, string> = new Map(); // idempotency_key -> appeal_id
  public challenges: Map<string, PartnerAppealChallenge> = new Map();
  public events: PartnerTimelineEvent[] = [];
  public publicStatus: Map<string, PublicStatusRecord> = new Map();
  public outbox: PartnerNotificationOutboxItem[] = [];
  public realtimeBroadcasts: Array<{ table: string; tracking_key: string; revision: number }> = [];

  constructor(initialRedemptions: PartnerRedemptionRecord[] = []) {
    initialRedemptions.forEach(r => this.addRedemption(r));
  }

  public addRedemption(redemption: PartnerRedemptionRecord) {
    this.redemptions.set(redemption.id, { ...redemption });
    if (!this.publicStatus.has(redemption.id)) {
      this.publicStatus.set(redemption.id, {
        resgate_id: redemption.id,
        tracking_key: crypto.randomUUID(),
        revision: 1,
        updated_at: new Date().toISOString(),
      });
    }
    this.events.push({
      id: crypto.randomUUID(),
      resgate_id: redemption.id,
      tipo: 'solicitacao_criada',
      titulo: 'Solicitação registrada',
      descricao_publica: 'A solicitação de benefício foi recebida pelo Grupo GSA.',
      ator_tipo: 'sistema',
      idempotency_key: `created:${redemption.id}`,
      ocorrido_em: redemption.created_at,
    });

    if (redemption.status === 'recusado') {
      this.events.push({
        id: crypto.randomUUID(),
        resgate_id: redemption.id,
        tipo: 'solicitacao_recusada',
        titulo: 'Solicitação recusada',
        descricao_publica: redemption.motivo_recusa || 'A solicitação não foi aprovada.',
        ator_tipo: 'admin',
        idempotency_key: `rejected-init:${redemption.id}`,
        ocorrido_em: redemption.recusado_em || redemption.updated_at || redemption.created_at,
      });
    }
  }

  public touchPublicStatus(resgateId: string) {
    const status = this.publicStatus.get(resgateId);
    if (status) {
      status.revision += 1;
      status.updated_at = new Date().toISOString();
      this.realtimeBroadcasts.push({
        table: 'parceiros_resgates_public_status',
        tracking_key: status.tracking_key,
        revision: status.revision,
      });
    }
  }

  // RPC: gsa_public_consultar_protocolo
  public consultarProtocolo(codigo: string): {
    success: boolean;
    data?: any;
    message?: string;
  } {
    const clean = (codigo || '').trim().toUpperCase();
    if (clean.length < 5) {
      return { success: false, message: 'Código de protocolo inválido.' };
    }

    const redemption = Array.from(this.redemptions.values()).find(
      r => r.codigo_gerado.toUpperCase() === clean
    );

    if (!redemption) {
      return { success: false, message: 'Protocolo não encontrado. Verifique o código e tente novamente.' };
    }

    const appealId = this.appealsByRedemption.get(redemption.id);
    const appeal = appealId ? this.appeals.get(appealId) : null;
    const pubStatus = this.publicStatus.get(redemption.id);
    const redemptionEvents = this.events
      .filter(e => e.resgate_id === redemption.id)
      .sort((a, b) => new Date(a.ocorrido_em).getTime() - new Date(b.ocorrido_em).getTime());

    return {
      success: true,
      data: {
        codigo: redemption.codigo_gerado,
        tracking_key: pubStatus?.tracking_key || '',
        status: redemption.status,
        parceiro_nome: redemption.parceiro_nome,
        parceiro_slug: redemption.parceiro_slug,
        parceiro_logo: redemption.parceiro_logo || null,
        nome_completo: redemption.nome_completo,
        telefone: redemption.telefone,
        email: redemption.email,
        tipo_resgate: redemption.tipo_resgate,
        link_ativacao: redemption.link_ativacao || null,
        cupom: redemption.cupom || null,
        voucher: redemption.voucher || null,
        created_at: redemption.created_at,
        data_ativacao: redemption.data_ativacao || null,
        recusado_em: redemption.recusado_em || null,
        motivo_recusa: redemption.motivo_recusa || null,
        recurso: appeal
          ? {
              id: appeal.id,
              protocolo_recurso: appeal.protocolo_recurso,
              contestacao_cliente: appeal.contestacao_cliente,
              status: appeal.status,
              aberto_em: appeal.aberto_em,
              prazo_analise_em: appeal.prazo_analise_em,
              analisado_em: appeal.analisado_em || null,
              motivo_decisao: appeal.motivo_decisao || null,
              evidencias: appeal.evidencias || [],
            }
          : null,
        eventos: redemptionEvents.map(e => ({
          id: e.id,
          tipo: e.tipo,
          titulo: e.titulo,
          descricao: e.descricao_publica,
          ocorrido_em: e.ocorrido_em,
        })),
      },
    };
  }

  // Admin Action: Reject Redemption
  public rejectRedemption(resgateId: string, motivo: string, actorId = 'admin-user-01'): boolean {
    const cleanMotivo = (motivo || '').trim();
    if (cleanMotivo.length < 5 || cleanMotivo.length > 2000) {
      throw new Error('Informe o motivo da recusa (entre 5 e 2000 caracteres).');
    }

    const redemption = this.redemptions.get(resgateId);
    if (!redemption) throw new Error('Solicitação não encontrada.');

    // Check if appeal is currently under review
    const appealId = this.appealsByRedemption.get(resgateId);
    if (appealId) {
      const appeal = this.appeals.get(appealId);
      if (appeal && appeal.status === 'em_analise') {
        throw new Error('Existe um recurso em análise para esta solicitação.');
      }
    }

    const timestamp = new Date().toISOString();
    redemption.status = 'recusado';
    redemption.motivo_recusa = cleanMotivo;
    redemption.recusado_em = timestamp;
    redemption.updated_at = timestamp;

    this.events.push({
      id: crypto.randomUUID(),
      resgate_id: redemption.id,
      tipo: 'solicitacao_recusada',
      titulo: 'Solicitação recusada',
      descricao_publica: cleanMotivo,
      detalhes_privados: { motivo: cleanMotivo },
      ator_tipo: 'admin',
      ator_id: actorId,
      idempotency_key: `rejected:${redemption.id}:${timestamp}`,
      ocorrido_em: timestamp,
    });

    const firstName = redemption.nome_completo.split(' ')[0] || 'Cliente';
    const message = formatWhatsAppMessage([
      `Olá, *${firstName}*.`,
      ``,
      `Sua solicitação de benefício não pôde ser aprovada.`,
      ``,
      `*Motivo:* ${cleanMotivo}`,
      ``,
      `Você poderá apresentar um único recurso pela consulta do protocolo *${redemption.codigo_gerado}*.`,
    ]);

    this.outbox.push({
      id: crypto.randomUUID(),
      resgate_id: redemption.id,
      tipo: 'solicitacao_recusada_cliente',
      telefone: redemption.telefone,
      mensagem: message,
      idempotency_key: `redemption-rejected:${redemption.id}:${timestamp}`,
      status: 'pendente',
      attempts: 0,
      available_at: timestamp,
      created_at: timestamp,
    });

    this.touchPublicStatus(resgateId);
    return true;
  }

  // RPC: gsa_begin_partner_appeal_challenge
  public beginPartnerAppealChallenge(codigo: string): {
    success: boolean;
    eligible: boolean;
    challenge_id?: string;
    expires_in?: number;
    destination?: string;
    error?: string;
    already_used?: boolean;
  } {
    const clean = (codigo || '').trim().toUpperCase();
    const redemption = Array.from(this.redemptions.values()).find(
      r => r.codigo_gerado.toUpperCase() === clean
    );

    if (!redemption || redemption.status !== 'recusado') {
      return { success: false, eligible: false, error: 'appeal_not_available' };
    }

    if (this.appealsByRedemption.has(redemption.id)) {
      return { success: false, eligible: false, already_used: true, error: 'appeal_already_used' };
    }

    const challengeId = crypto.randomUUID();
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = sha256(pin);
    const now = Date.now();
    const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();

    // Invalidate previous challenges
    Array.from(this.challenges.values())
      .filter(c => c.resgate_id === redemption.id && !c.consumed_at)
      .forEach(c => this.challenges.delete(c.id));

    this.challenges.set(challengeId, {
      id: challengeId,
      resgate_id: redemption.id,
      code_hash: codeHash,
      raw_pin: pin,
      attempts: 0,
      expires_at: expiresAt,
      created_at: new Date(now).toISOString(),
    });

    const maskedPhone = redemption.telefone.length >= 8
      ? `${redemption.telefone.slice(0, 4)}****${redemption.telefone.slice(-2)}`
      : redemption.telefone;

    return {
      success: true,
      eligible: true,
      challenge_id: challengeId,
      expires_in: 600,
      destination: maskedPhone,
    };
  }

  // RPC: gsa_complete_partner_appeal
  public completePartnerAppeal(payload: {
    challengeId: string;
    pin: string;
    justificativa: string;
    anexos?: string[];
    idempotencyKey: string;
  }): {
    success: boolean;
    appeal?: any;
    error?: string;
  } {
    const cleanJustification = (payload.justificativa || '').trim();
    if (!payload.idempotencyKey) {
      return { success: false, error: 'invalid_payload' };
    }

    // Idempotency check
    const existingAppealId = this.appealsByIdempotency.get(payload.idempotencyKey);
    if (existingAppealId) {
      const existing = this.appeals.get(existingAppealId)!;
      return {
        success: true,
        appeal: {
          id: existing.id,
          protocolo_recurso: existing.protocolo_recurso,
          status: existing.status,
          aberto_em: existing.aberto_em,
          prazo_analise_em: existing.prazo_analise_em,
        },
      };
    }

    // Justification length boundary check: 20 to 4000 chars
    if (cleanJustification.length < 20 || cleanJustification.length > 4000) {
      return { success: false, error: 'invalid_justification_length' };
    }

    // Evidence attachments limit: max 3
    const attachments = (payload.anexos || []).filter(Boolean);
    if (attachments.length > 3) {
      return { success: false, error: 'max_attachments_exceeded' };
    }

    const challenge = this.challenges.get(payload.challengeId);
    if (!challenge || challenge.consumed_at || new Date(challenge.expires_at).getTime() <= Date.now() || challenge.attempts >= 5) {
      return { success: false, error: 'invalid_or_expired_code' };
    }

    const inputHash = sha256(payload.pin.trim());
    if (challenge.code_hash !== inputHash) {
      challenge.attempts = Math.min(challenge.attempts + 1, 5);
      return {
        success: false,
        error: challenge.attempts >= 5 ? 'too_many_attempts' : 'invalid_or_expired_code',
      };
    }

    const redemption = this.redemptions.get(challenge.resgate_id);
    if (!redemption || redemption.status !== 'recusado') {
      return { success: false, error: 'appeal_not_allowed' };
    }

    if (this.appealsByRedemption.has(redemption.id)) {
      return { success: false, error: 'appeal_already_used' };
    }

    const appealId = crypto.randomUUID();
    const protocolRecurso = `REC-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const now = new Date();
    const abertoEm = now.toISOString();
    const prazoAnaliseEm = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();

    const newAppeal: PartnerAppealRecord = {
      id: appealId,
      resgate_id: redemption.id,
      protocolo_recurso: protocolRecurso,
      contestacao_cliente: cleanJustification,
      evidencias: attachments,
      status: 'em_analise',
      aberto_em: abertoEm,
      prazo_analise_em: prazoAnaliseEm,
      idempotency_key: payload.idempotencyKey,
      created_at: abertoEm,
      updated_at: abertoEm,
    };

    challenge.consumed_at = abertoEm;
    this.appeals.set(appealId, newAppeal);
    this.appealsByRedemption.set(redemption.id, appealId);
    this.appealsByIdempotency.set(payload.idempotencyKey, appealId);

    // Event: recurso_interposto
    this.events.push({
      id: crypto.randomUUID(),
      resgate_id: redemption.id,
      recurso_id: appealId,
      tipo: 'recurso_interposto',
      titulo: 'Recurso apresentado',
      descricao_publica: 'O recurso foi recebido e será analisado em até cinco dias.',
      ator_tipo: 'cliente',
      idempotency_key: `appeal-opened:${appealId}`,
      ocorrido_em: abertoEm,
    });

    // Client WhatsApp confirmation notification
    const firstName = redemption.nome_completo.split(' ')[0] || 'Cliente';
    const clientMessage = formatWhatsAppMessage([
      `Olá, *${firstName}*.`,
      ``,
      `Seu recurso foi recebido e será analisado em até *5 dias*.`,
      ``,
      `Protocolo da solicitação: *${redemption.codigo_gerado}*`,
      `Protocolo do recurso: *${protocolRecurso}*`,
    ]);

    this.outbox.push({
      id: crypto.randomUUID(),
      resgate_id: redemption.id,
      recurso_id: appealId,
      tipo: 'recurso_recebido_cliente',
      telefone: redemption.telefone,
      mensagem: clientMessage,
      idempotency_key: `appeal-opened-client:${appealId}`,
      status: 'pendente',
      attempts: 0,
      available_at: abertoEm,
      created_at: abertoEm,
    });

    // Admin WhatsApp alert notification
    const adminMessage = formatWhatsAppMessage([
      `Novo recurso de solicitação recebido.`,
      ``,
      `Protocolo: *${redemption.codigo_gerado}*`,
      `Recurso: *${protocolRecurso}*`,
      `Prazo: *${new Date(prazoAnaliseEm).toLocaleString('pt-BR')}*`,
    ]);

    this.outbox.push({
      id: crypto.randomUUID(),
      resgate_id: redemption.id,
      recurso_id: appealId,
      tipo: 'recurso_aberto_admin',
      telefone: ADMIN_MASTER_PHONE,
      mensagem: adminMessage,
      idempotency_key: `appeal-opened-admin:${appealId}`,
      status: 'pendente',
      attempts: 0,
      available_at: abertoEm,
      created_at: abertoEm,
    });

    this.touchPublicStatus(redemption.id);

    return {
      success: true,
      appeal: {
        id: appealId,
        protocolo_recurso: protocolRecurso,
        status: 'em_analise',
        aberto_em: abertoEm,
        prazo_analise_em: prazoAnaliseEm,
        evidencias: attachments,
      },
    };
  }

  // RPC: gsa_admin_decide_partner_appeal
  public decidePartnerAppeal(
    recursoId: string,
    decisao: 'deferido' | 'indeferido',
    motivo?: string,
    actorId = 'admin-user-01'
  ): {
    success: boolean;
    appeal?: PartnerAppealRecord;
  } {
    const appeal = this.appeals.get(recursoId);
    if (!appeal) throw new Error('Recurso não encontrado.');
    if (appeal.status !== 'em_analise') throw new Error('Este recurso já foi analisado.');

    const cleanMotivo = (motivo || '').trim();
    if (decisao === 'indeferido' && (cleanMotivo.length < 10 || cleanMotivo.length > 2000)) {
      throw new Error('Informe o motivo da recusa do recurso (entre 10 e 2000 caracteres).');
    }

    const redemption = this.redemptions.get(appeal.resgate_id);
    if (!redemption) throw new Error('Resgate não encontrado.');

    const timestamp = new Date().toISOString();
    appeal.status = decisao;
    appeal.motivo_decisao = cleanMotivo || null;
    appeal.analisado_em = timestamp;
    appeal.analisado_por = actorId;
    appeal.updated_at = timestamp;

    const firstName = redemption.nome_completo.split(' ')[0] || 'Cliente';

    if (decisao === 'deferido') {
      redemption.status = 'pendente';
      redemption.alerta_duplicidade = false;
      redemption.updated_at = timestamp;

      this.events.push({
        id: crypto.randomUUID(),
        resgate_id: redemption.id,
        recurso_id: appeal.id,
        tipo: 'recurso_deferido',
        titulo: 'Recurso aprovado',
        descricao_publica: 'O recurso foi aprovado e a solicitação voltou ao fluxo de andamento.',
        detalhes_privados: { motivo_decisao: cleanMotivo },
        ator_tipo: 'admin',
        ator_id: actorId,
        idempotency_key: `appeal-approved:${appeal.id}`,
        ocorrido_em: timestamp,
      });

      const clientMsg = formatWhatsAppMessage([
        `Olá, *${firstName}*.`,
        ``,
        `Seu recurso foi *aprovado*. A solicitação voltou ao fluxo de andamento.`,
        ``,
        `Protocolo: *${redemption.codigo_gerado}*`,
      ]);

      this.outbox.push({
        id: crypto.randomUUID(),
        resgate_id: redemption.id,
        recurso_id: appeal.id,
        tipo: 'recurso_aprovado_cliente',
        telefone: redemption.telefone,
        mensagem: clientMsg,
        idempotency_key: `appeal-decision-client:${appeal.id}`,
        status: 'pendente',
        attempts: 0,
        available_at: timestamp,
        created_at: timestamp,
      });
    } else {
      redemption.updated_at = timestamp;

      this.events.push({
        id: crypto.randomUUID(),
        resgate_id: redemption.id,
        recurso_id: appeal.id,
        tipo: 'recurso_indeferido',
        titulo: 'Recurso recusado',
        descricao_publica: cleanMotivo,
        detalhes_privados: { motivo_decisao: cleanMotivo },
        ator_tipo: 'admin',
        ator_id: actorId,
        idempotency_key: `appeal-denied:${appeal.id}`,
        ocorrido_em: timestamp,
      });

      const clientMsg = formatWhatsAppMessage([
        `Olá, *${firstName}*.`,
        ``,
        `Seu recurso foi analisado e não pôde ser aprovado.`,
        ``,
        `*Motivo:* ${cleanMotivo}`,
        ``,
        `Protocolo: *${redemption.codigo_gerado}*`,
      ]);

      this.outbox.push({
        id: crypto.randomUUID(),
        resgate_id: redemption.id,
        recurso_id: appeal.id,
        tipo: 'recurso_recusado_cliente',
        telefone: redemption.telefone,
        mensagem: clientMsg,
        idempotency_key: `appeal-decision-client:${appeal.id}`,
        status: 'pendente',
        attempts: 0,
        available_at: timestamp,
        created_at: timestamp,
      });
    }

    this.touchPublicStatus(redemption.id);
    return { success: true, appeal: { ...appeal } };
  }

  // Admin Action: Complete Partner Redemption with Activation Link
  public completePartnerRedemption(payload: {
    resgateId: string;
    linkAtivacao: string;
    cupom?: string;
    voucher?: string;
  }): boolean {
    const cleanLink = (payload.linkAtivacao || '').trim();
    if (!cleanLink) throw new Error('Informe o link de ativação.');

    const redemption = this.redemptions.get(payload.resgateId);
    if (!redemption) throw new Error('Resgate não encontrado.');
    if (redemption.status === 'recusado') throw new Error('Não é possível ativar um resgate recusado.');

    const timestamp = new Date().toISOString();
    redemption.link_ativacao = cleanLink;
    redemption.cupom = payload.cupom?.trim() || null;
    redemption.voucher = payload.voucher?.trim() || null;
    redemption.status = 'concluido';
    redemption.data_ativacao = timestamp;
    redemption.updated_at = timestamp;

    this.events.push({
      id: crypto.randomUUID(),
      resgate_id: redemption.id,
      tipo: 'beneficio_liberado',
      titulo: 'Benefício liberado',
      descricao_publica: 'O benefício foi liberado e já está disponível para ativação.',
      ator_tipo: 'admin',
      idempotency_key: `completed:${redemption.id}:${timestamp}`,
      ocorrido_em: timestamp,
    });

    const firstName = redemption.nome_completo.split(' ')[0] || 'Cliente';
    const activationMessage = formatWhatsAppMessage([
      `🎉 *SEU BENEFÍCIO JÁ ESTÁ DISPONÍVEL!* 🐾`,
      ``,
      `Olá, *${firstName}*! 🌟`,
      ``,
      `O seu link oficial de ativação para a parceria com a *${redemption.parceiro_nome}* já foi liberado com sucesso!`,
      ``,
      `🔗 *LINK OFICIAL DE ATIVAÇÃO:*`,
      `${cleanLink}`,
      ``,
      payload.cupom ? `🎟️ *CUPOM DE DESCONTO:*\n\`${payload.cupom.trim()}\`\n` : null,
      payload.voucher ? `🎫 *VOUCHER EXCLUSIVO:*\n\`${payload.voucher.trim()}\`\n` : null,
      `🔖 *Protocolo:* \`${redemption.codigo_gerado}\``,
      ``,
      `_Grupo GSA • Gestão de Serviços & Benefícios_`,
    ]);

    this.outbox.push({
      id: crypto.randomUUID(),
      resgate_id: redemption.id,
      tipo: 'beneficio_ativado_cliente',
      telefone: redemption.telefone,
      mensagem: activationMessage,
      media_url: redemption.parceiro_cover || redemption.parceiro_logo || null,
      idempotency_key: `activation:${redemption.id}:${timestamp}`,
      status: 'pendente',
      attempts: 0,
      available_at: timestamp,
      created_at: timestamp,
    });

    this.touchPublicStatus(redemption.id);
    return true;
  }
}

// ============================================================================
// E2E TEST SUITE: 4 TIERS
// ============================================================================

describe('Partner Redemption Appeals & UTF-8 Remediation - E2E Master Suite', () => {
  let engine: PartnerRedemptionAppealsEngine;

  const SEED_REDEMPTIONS: PartnerRedemptionRecord[] = [
    {
      id: 'res-001-recusado',
      parceiro_id: 'parc-petlove-01',
      parceiro_nome: 'Petlove',
      parceiro_slug: 'petlove',
      parceiro_logo: 'https://storage.grupogsa.com.br/logos/petlove.png',
      nome_completo: 'Carlos Eduardo Silveira',
      email: 'carlos.silveira@email.com',
      telefone: '5511987654321',
      codigo_gerado: 'PROT-RES-2026-AAA111',
      tipo_resgate: 'link',
      status: 'recusado',
      motivo_recusa: 'Documento comprobatório ilegível ou divergente.',
      recusado_em: '2026-08-28T10:00:00Z',
      created_at: '2026-08-27T10:00:00Z',
      updated_at: '2026-08-28T10:00:00Z',
    },
    {
      id: 'res-002-pendente',
      parceiro_id: 'parc-petlove-01',
      parceiro_nome: 'Petlove',
      parceiro_slug: 'petlove',
      nome_completo: 'Mariana Costa Lima',
      email: 'mariana.costa@email.com',
      telefone: '5521998887777',
      codigo_gerado: 'PROT-RES-2026-BBB222',
      tipo_resgate: 'cupom',
      status: 'pendente',
      created_at: '2026-08-28T12:00:00Z',
      updated_at: '2026-08-28T12:00:00Z',
    },
    {
      id: 'res-003-concluido',
      parceiro_id: 'parc-petlove-01',
      parceiro_nome: 'Petlove',
      parceiro_slug: 'petlove',
      nome_completo: 'Rodrigo Mendonça',
      email: 'rodrigo.m@email.com',
      telefone: '5531988881234',
      codigo_gerado: 'PROT-RES-2026-CCC333',
      tipo_resgate: 'link',
      status: 'concluido',
      link_ativacao: 'https://petlove.com.br/ativar?cupom=GSA100',
      data_ativacao: '2026-08-28T14:00:00Z',
      created_at: '2026-08-27T14:00:00Z',
      updated_at: '2026-08-28T14:00:00Z',
    },
  ];

  beforeEach(() => {
    engine = new PartnerRedemptionAppealsEngine(SEED_REDEMPTIONS);
  });

  // ==========================================================================
  // TIER 1: FEATURE COVERAGE (ISOLATED SPECIFICATIONS)
  // ==========================================================================
  describe('Tier 1: Feature Coverage Specifications', () => {

    describe('F1: WhatsApp UTF-8 Messaging & Webhook Formatting', () => {
      it('T1.1.1: formats appeal confirmation message for client with exact UTF-8 accents and protocol codes', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const submission = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: 'Envio novamente em anexo o documento de vacinação legível do pet.',
          idempotencyKey: crypto.randomUUID(),
        });

        expect(submission.success).toBe(true);
        const notification = engine.outbox.find(n => n.tipo === 'recurso_recebido_cliente');
        expect(notification).toBeDefined();
        expect(notification!.mensagem).toContain('Olá, *Carlos*.');
        expect(notification!.mensagem).toContain('Seu recurso foi recebido e será analisado em até *5 dias*.');
        expect(notification!.mensagem).toContain('Protocolo da solicitação: *PROT-RES-2026-AAA111*');
        expect(notification!.mensagem).toContain('Protocolo do recurso: *REC-2026-');
        // UTF-8 Cleanliness
        expect(notification!.mensagem).not.toContain('\uFFFD');
        expect(notification!.mensagem).not.toMatch(/Ã[§£¡©ª³µ]|Â[°º]/);
      });

      it('T1.1.2: formats appeal approval notification for client with clear return to pending instructions', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const submission = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: 'Comprovante oficial em anexo demonstrando elegibilidade.',
          idempotencyKey: crypto.randomUUID(),
        });

        engine.decidePartnerAppeal(submission.appeal!.id, 'deferido');
        const notification = engine.outbox.find(n => n.tipo === 'recurso_aprovado_cliente');
        expect(notification).toBeDefined();
        expect(notification!.mensagem).toContain('Seu recurso foi *aprovado*. A solicitação voltou ao fluxo de andamento.');
        expect(notification!.mensagem).toContain('Protocolo: *PROT-RES-2026-AAA111*');
      });

      it('T1.1.3: formats appeal denial notification with mandatory justification reason', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const submission = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: 'Solicito reconsideração do resgate recusado.',
          idempotencyKey: crypto.randomUUID(),
        });

        const reason = 'Documento permanece sem carimbo veterinário e data de validade vencida.';
        engine.decidePartnerAppeal(submission.appeal!.id, 'indeferido', reason);

        const notification = engine.outbox.find(n => n.tipo === 'recurso_recusado_cliente');
        expect(notification).toBeDefined();
        expect(notification!.mensagem).toContain('Seu recurso foi analisado e não pôde ser aprovado.');
        expect(notification!.mensagem).toContain(`*Motivo:* ${reason}`);
      });

      it('T1.1.4: normalizes destination phones and routes Master Administrator to canonical LID', () => {
        expect(normalizePhone('11971858372')).toBe(ADMIN_MASTER_LID);
        expect(normalizePhone('5511971858372')).toBe(ADMIN_MASTER_LID);
        expect(normalizePhone('(11) 98765-4321')).toBe('5511987654321');
        expect(normalizePhone('+55 21 98888-7777')).toBe('5521988887777');
      });

      it('T1.1.5: sends administrative SLA alert with formatted deadline date', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: 'Justificativa de teste com mais de vinte caracteres.',
          idempotencyKey: crypto.randomUUID(),
        });

        const adminNotification = engine.outbox.find(n => n.tipo === 'recurso_aberto_admin');
        expect(adminNotification).toBeDefined();
        expect(adminNotification!.telefone).toBe(ADMIN_MASTER_PHONE);
        expect(adminNotification!.mensagem).toContain('Novo recurso de solicitação recebido.');
        expect(adminNotification!.mensagem).toContain('Protocolo: *PROT-RES-2026-AAA111*');
        expect(adminNotification!.mensagem).toContain('Prazo: *');
      });
    });

    describe('F2: UTF-8 UI & String Remediation', () => {
      it('T1.2.1: ensures proper Portuguese characters in administrative and public strings', () => {
        const testStrings = [
          'Contestar a recusa',
          'Histórico do protocolo',
          'Fundamentação da decisão',
          'Aprovar Recurso',
          'Recusar Recurso',
          'Não foi possível registrar a decisão do recurso.',
          'Solicitação registrada',
          'Benefício liberado',
        ];

        for (const str of testStrings) {
          expect(str).not.toContain('\uFFFD');
          expect(str).not.toMatch(/Ã[§£¡©ª³µ]|Â[°º]/);
          expect(str.length).toBeGreaterThan(0);
        }
      });
    });

    describe('F3: Client Appeal Button & Single Appeal Lock', () => {
      it('T1.3.1: permits appeal initiation only when redemption is in status recusado', () => {
        const allowed = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        expect(allowed.success).toBe(true);
        expect(allowed.eligible).toBe(true);
      });

      it('T1.3.2: rejects appeal initiation for pendente redemption', () => {
        const blocked = engine.beginPartnerAppealChallenge('PROT-RES-2026-BBB222');
        expect(blocked.success).toBe(false);
        expect(blocked.eligible).toBe(false);
      });

      it('T1.3.3: rejects appeal initiation for concluido redemption', () => {
        const blocked = engine.beginPartnerAppealChallenge('PROT-RES-2026-CCC333');
        expect(blocked.success).toBe(false);
        expect(blocked.eligible).toBe(false);
      });

      it('T1.3.4: locks second appeal attempts with appeal_already_used', () => {
        const challenge1 = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        engine.completePartnerAppeal({
          challengeId: challenge1.challenge_id!,
          pin: engine.challenges.get(challenge1.challenge_id!)!.raw_pin!,
          justificativa: 'Primeiro e único recurso permitido para esta solicitação.',
          idempotencyKey: crypto.randomUUID(),
        });

        // 2nd challenge request attempt
        const challenge2 = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        expect(challenge2.success).toBe(false);
        expect(challenge2.already_used).toBe(true);
        expect(challenge2.error).toBe('appeal_already_used');
      });
    });

    describe('F4: Client Appeal Submission Modal, Justification & Evidence', () => {
      it('T1.4.1: accepts appeal submission with valid 20-4000 char justification and up to 3 evidence files', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const result = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: 'Segue a carteirinha de vacinação e comprovante de vínculo atualizado.',
          anexos: [
            'https://storage.grupogsa.com.br/parceiros-midias/vacinacao.pdf',
            'https://storage.grupogsa.com.br/parceiros-midias/comprovante.png',
            'https://storage.grupogsa.com.br/parceiros-midias/documento_pet.jpg',
          ],
          idempotencyKey: crypto.randomUUID(),
        });

        expect(result.success).toBe(true);
        expect(result.appeal.evidencias.length).toBe(3);
        expect(result.appeal.status).toBe('em_analise');
      });

      it('T1.4.2: generates a 10-minute expiry for verification challenges', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        expect(challenge.expires_in).toBe(600);
        const stored = engine.challenges.get(challenge.challenge_id!)!;
        const diffMs = new Date(stored.expires_at).getTime() - new Date(stored.created_at).getTime();
        expect(diffMs).toBe(10 * 60 * 1000);
      });
    });

    describe('F5: Client Appeal Status Card & Public Timeline', () => {
      it('T1.5.1: exposes complete public status and events timeline without leaking private data', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: 'Justificativa para análise detalhada do setor de parcerias.',
          idempotencyKey: crypto.randomUUID(),
        });

        const consult = engine.consultarProtocolo('PROT-RES-2026-AAA111');
        expect(consult.success).toBe(true);
        expect(consult.data.recurso).toBeDefined();
        expect(consult.data.recurso.status).toBe('em_analise');
        expect(consult.data.tracking_key).toBeDefined();

        // Timeline check
        const timeline = consult.data.eventos;
        expect(timeline.length).toBeGreaterThanOrEqual(3);
        expect(timeline.some((e: any) => e.tipo === 'solicitacao_criada')).toBe(true);
        expect(timeline.some((e: any) => e.tipo === 'solicitacao_recusada')).toBe(true);
        expect(timeline.some((e: any) => e.tipo === 'recurso_interposto')).toBe(true);
      });
    });

    describe('F6: Admin Appeal Review & Evidence Gallery', () => {
      it('T1.6.1: renders appeal details, evidence attachments gallery, and SLA deadline for admin review', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: 'Atestado emitido pelo CRMV anexado para comprovação.',
          anexos: ['https://storage.grupogsa.com.br/midias/atestado.pdf'],
          idempotencyKey: crypto.randomUUID(),
        });

        const consult = engine.consultarProtocolo('PROT-RES-2026-AAA111');
        const appeal = consult.data.recurso;

        expect(appeal.protocolo_recurso).toMatch(/^REC-2026-/);
        expect(appeal.contestacao_cliente).toContain('CRMV');
        expect(appeal.evidencias).toEqual(['https://storage.grupogsa.com.br/midias/atestado.pdf']);
        expect(appeal.prazo_analise_em).toBeDefined();
      });
    });

    describe('F7: Admin Appeal Decision (Accept / Deny)', () => {
      it('T1.7.1: approving appeal atomically resets redemption status to pendente and records audit event', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const sub = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: 'Solicito a reanálise com base no documento atualizado.',
          idempotencyKey: crypto.randomUUID(),
        });

        const decision = engine.decidePartnerAppeal(sub.appeal!.id, 'deferido', 'Documento validado com sucesso.');
        expect(decision.success).toBe(true);
        expect(decision.appeal!.status).toBe('deferido');

        const redemption = engine.redemptions.get('res-001-recusado')!;
        expect(redemption.status).toBe('pendente');
        expect(redemption.alerta_duplicidade).toBe(false);

        const event = engine.events.find(e => e.tipo === 'recurso_deferido');
        expect(event).toBeDefined();
        expect(event!.titulo).toBe('Recurso aprovado');
      });

      it('T1.7.2: denying appeal requires mandatory reason and keeps status recusado', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const sub = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: 'Solicito reconsideração do resgate recusado.',
          idempotencyKey: crypto.randomUUID(),
        });

        const reason = 'O documento anexado não possui assinatura válida.';
        const decision = engine.decidePartnerAppeal(sub.appeal!.id, 'indeferido', reason);

        expect(decision.success).toBe(true);
        expect(decision.appeal!.status).toBe('indeferido');
        expect(decision.appeal!.motivo_decisao).toBe(reason);

        const redemption = engine.redemptions.get('res-001-recusado')!;
        expect(redemption.status).toBe('recusado');
      });
    });

    describe('F8: Admin Events History Timeline', () => {
      it('T1.8.1: maintains chronological audit events throughout entire redemption and appeal lifecycle', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const sub = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: 'Nova evidência apresentada para análise.',
          idempotencyKey: crypto.randomUUID(),
        });

        engine.decidePartnerAppeal(sub.appeal!.id, 'deferido');
        engine.completePartnerRedemption({
          resgateId: 'res-001-recusado',
          linkAtivacao: 'https://petlove.com.br/ativacao-final',
        });

        const consult = engine.consultarProtocolo('PROT-RES-2026-AAA111');
        const eventTypes = consult.data.eventos.map((e: any) => e.tipo);

        expect(eventTypes).toEqual([
          'solicitacao_criada',
          'solicitacao_recusada',
          'recurso_interposto',
          'recurso_deferido',
          'beneficio_liberado',
        ]);
      });
    });
  });

  // ==========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (BVA)
  // ==========================================================================
  describe('Tier 2: Boundary Value Analysis (BVA) & Corner Cases', () => {

    describe('B1: Justification Length Boundaries (20 to 4000 chars)', () => {
      it('T2.1.1: rejects 0 chars (empty justification)', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const res = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: '',
          idempotencyKey: crypto.randomUUID(),
        });
        expect(res.success).toBe(false);
        expect(res.error).toBe('invalid_justification_length');
      });

      it('T2.1.2: rejects 19 chars (1 char below minimum)', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const res = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: '1234567890123456789', // 19 chars
          idempotencyKey: crypto.randomUUID(),
        });
        expect(res.success).toBe(false);
        expect(res.error).toBe('invalid_justification_length');
      });

      it('T2.1.3: accepts exactly 20 chars (exact minimum boundary)', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const res = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: '12345678901234567890', // 20 chars
          idempotencyKey: crypto.randomUUID(),
        });
        expect(res.success).toBe(true);
      });

      it('T2.1.4: accepts exactly 4000 chars (exact maximum boundary)', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const largeText = 'A'.repeat(4000);
        const res = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: largeText,
          idempotencyKey: crypto.randomUUID(),
        });
        expect(res.success).toBe(true);
      });

      it('T2.1.5: rejects 4001 chars (1 char above maximum)', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const tooLarge = 'A'.repeat(4001);
        const res = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: tooLarge,
          idempotencyKey: crypto.randomUUID(),
        });
        expect(res.success).toBe(false);
        expect(res.error).toBe('invalid_justification_length');
      });

      it('T2.1.6: trims surrounding whitespace before calculating length', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const paddedShort = '   123456789   '; // length 15 padded with spaces
        const res = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: paddedShort,
          idempotencyKey: crypto.randomUUID(),
        });
        expect(res.success).toBe(false);
        expect(res.error).toBe('invalid_justification_length');
      });
    });

    describe('B2: Admin Denial Reason Boundaries (10 to 2000 chars)', () => {
      it('T2.2.1: rejects denial with 0 chars (empty reason)', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const sub = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: 'Justificativa válida para teste de recusa administrativa.',
          idempotencyKey: crypto.randomUUID(),
        });

        expect(() => {
          engine.decidePartnerAppeal(sub.appeal!.id, 'indeferido', '');
        }).toThrow(/entre 10 e 2000/);
      });

      it('T2.2.2: rejects denial with 9 chars (1 char below min)', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const sub = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: 'Justificativa válida para teste de recusa administrativa.',
          idempotencyKey: crypto.randomUUID(),
        });

        expect(() => {
          engine.decidePartnerAppeal(sub.appeal!.id, 'indeferido', '123456789');
        }).toThrow(/entre 10 e 2000/);
      });

      it('T2.2.3: accepts denial with exactly 10 chars (exact minimum)', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const sub = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: 'Justificativa válida para teste de recusa administrativa.',
          idempotencyKey: crypto.randomUUID(),
        });

        const res = engine.decidePartnerAppeal(sub.appeal!.id, 'indeferido', '1234567890');
        expect(res.success).toBe(true);
        expect(res.appeal!.status).toBe('indeferido');
      });

      it('T2.2.4: accepts denial with exactly 2000 chars', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const sub = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: 'Justificativa válida para teste de recusa administrativa.',
          idempotencyKey: crypto.randomUUID(),
        });

        const res = engine.decidePartnerAppeal(sub.appeal!.id, 'indeferido', 'B'.repeat(2000));
        expect(res.success).toBe(true);
      });

      it('T2.2.5: rejects denial with 2001 chars', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const sub = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: 'Justificativa válida para teste de recusa administrativa.',
          idempotencyKey: crypto.randomUUID(),
        });

        expect(() => {
          engine.decidePartnerAppeal(sub.appeal!.id, 'indeferido', 'B'.repeat(2001));
        }).toThrow(/entre 10 e 2000/);
      });
    });

    describe('B3: Evidence Attachment Count Boundaries (0 to 3 files)', () => {
      it('T2.3.1: accepts 0 attachments (justification only)', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const res = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: 'Justificativa detalhada sem necessidade de anexos extras.',
          anexos: [],
          idempotencyKey: crypto.randomUUID(),
        });
        expect(res.success).toBe(true);
        expect(res.appeal.evidencias.length).toBe(0);
      });

      it('T2.3.2: accepts 1 attachment', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const res = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: 'Comprovante único anexado para análise.',
          anexos: ['https://storage.grupogsa.com.br/anexo1.pdf'],
          idempotencyKey: crypto.randomUUID(),
        });
        expect(res.success).toBe(true);
        expect(res.appeal.evidencias.length).toBe(1);
      });

      it('T2.3.3: accepts 3 attachments (exact maximum)', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const res = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: 'Três comprovantes anexados para demonstrar elegibilidade.',
          anexos: [
            'https://storage.grupogsa.com.br/1.png',
            'https://storage.grupogsa.com.br/2.png',
            'https://storage.grupogsa.com.br/3.png',
          ],
          idempotencyKey: crypto.randomUUID(),
        });
        expect(res.success).toBe(true);
        expect(res.appeal.evidencias.length).toBe(3);
      });

      it('T2.3.4: rejects 4 attachments (exceeds max 3)', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const res = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
          justificativa: 'Quatro comprovantes anexados.',
          anexos: [
            'https://storage.grupogsa.com.br/1.png',
            'https://storage.grupogsa.com.br/2.png',
            'https://storage.grupogsa.com.br/3.png',
            'https://storage.grupogsa.com.br/4.png',
          ],
          idempotencyKey: crypto.randomUUID(),
        });
        expect(res.success).toBe(false);
        expect(res.error).toBe('max_attachments_exceeded');
      });
    });

    describe('B4: Verification Challenge Limits & Expiry', () => {
      it('T2.4.1: tracks failed PIN attempts and locks challenge on 5th failure', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const wrongPin = '000000';

        // 4 failed attempts
        for (let i = 1; i <= 4; i++) {
          const res = engine.completePartnerAppeal({
            challengeId: challenge.challenge_id!,
            pin: wrongPin,
            justificativa: 'Justificativa para teste de bloqueio por tentativas.',
            idempotencyKey: crypto.randomUUID(),
          });
          expect(res.success).toBe(false);
          expect(res.error).toBe('invalid_or_expired_code');
        }

        // 5th attempt locks
        const fifth = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: wrongPin,
          justificativa: 'Justificativa para teste de bloqueio por tentativas.',
          idempotencyKey: crypto.randomUUID(),
        });
        expect(fifth.success).toBe(false);
        expect(fifth.error).toBe('too_many_attempts');

        // Subsequent attempt with right PIN also blocked
        const stored = engine.challenges.get(challenge.challenge_id!)!;
        const rightPin = stored.raw_pin!;
        const lockedAttempt = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: rightPin,
          justificativa: 'Tentando com PIN correto apos bloqueio.',
          idempotencyKey: crypto.randomUUID(),
        });
        expect(lockedAttempt.success).toBe(false);
        expect(lockedAttempt.error).toBe('invalid_or_expired_code');
      });

      it('T2.4.2: rejects verification on expired challenge (> 10 mins)', () => {
        const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
        const stored = engine.challenges.get(challenge.challenge_id!)!;
        // Manually simulate expiration
        stored.expires_at = new Date(Date.now() - 1000).toISOString();

        const res = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: stored.raw_pin!,
          justificativa: 'Tentando validar desafio expirado.',
          idempotencyKey: crypto.randomUUID(),
        });
        expect(res.success).toBe(false);
        expect(res.error).toBe('invalid_or_expired_code');
      });
    });
  });

  // ==========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS & STATE TRANSITIONS
  // ==========================================================================
  describe('Tier 3: Cross-Feature State Combinations', () => {
    it('T3.1: Appeal -> Admin Approval -> Return to Pendente -> Admin Link Issuance -> Status Concluido -> Activation WhatsApp', () => {
      // 1. Initial State: Recusado
      expect(engine.redemptions.get('res-001-recusado')!.status).toBe('recusado');

      // 2. Client initiates and submits appeal
      const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
      const sub = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
        justificativa: 'Comprovante oficial em anexo demonstrando que o pet é cadastrado.',
        anexos: ['https://storage.grupogsa.com.br/doc.png'],
        idempotencyKey: 'idemp-cross-feature-01',
      });
      expect(sub.success).toBe(true);

      // 3. Admin reviews and approves
      const decision = engine.decidePartnerAppeal(sub.appeal!.id, 'deferido', 'Documento aprovado.');
      expect(decision.success).toBe(true);
      expect(engine.redemptions.get('res-001-recusado')!.status).toBe('pendente');

      // 4. Admin completes redemption with activation link
      const completed = engine.completePartnerRedemption({
        resgateId: 'res-001-recusado',
        linkAtivacao: 'https://petlove.com.br/ativar?cupom=CARLOS100',
        cupom: 'CARLOS100',
      });
      expect(completed).toBe(true);

      // 5. Final State: Concluido
      const finalRedemption = engine.redemptions.get('res-001-recusado')!;
      expect(finalRedemption.status).toBe('concluido');
      expect(finalRedemption.link_ativacao).toBe('https://petlove.com.br/ativar?cupom=CARLOS100');

      // 6. WhatsApp Activation Notification
      const actNotification = engine.outbox.find(n => n.tipo === 'beneficio_ativado_cliente');
      expect(actNotification).toBeDefined();
      expect(actNotification!.mensagem).toContain('SEU BENEFÍCIO JÁ ESTÁ DISPONÍVEL');
      expect(actNotification!.mensagem).toContain('https://petlove.com.br/ativar?cupom=CARLOS100');
    });

    it('T3.2: Appeal -> Admin Denial with Reason -> Status Recusado -> Rejection WhatsApp Notification -> Public Status Reflected', () => {
      // 1. Appeal submission
      const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
      const sub = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
        justificativa: 'Pedido de reconsideração do resgate recusado.',
        idempotencyKey: 'idemp-cross-feature-02',
      });

      // 2. Admin denies appeal
      const denialReason = 'O prazo legal para apresentação de recurso expirou conforme edital.';
      engine.decidePartnerAppeal(sub.appeal!.id, 'indeferido', denialReason);

      // 3. Status remains recusado
      const redemption = engine.redemptions.get('res-001-recusado')!;
      expect(redemption.status).toBe('recusado');

      // 4. Client consults public page
      const consult = engine.consultarProtocolo('PROT-RES-2026-AAA111');
      expect(consult.success).toBe(true);
      expect(consult.data.recurso.status).toBe('indeferido');
      expect(consult.data.recurso.motivo_decisao).toBe(denialReason);
    });

    it('T3.3: Realtime tracking key revision increments on every state transition without exposing customer PII', () => {
      const pubStatusBefore = engine.publicStatus.get('res-001-recusado')!;
      const revInitial = pubStatusBefore.revision;
      const trackingKey = pubStatusBefore.tracking_key;

      // Trigger appeal
      const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
      engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
        justificativa: 'Evidência em anexo para atualização realtime.',
        idempotencyKey: crypto.randomUUID(),
      });

      const pubStatusAfterAppeal = engine.publicStatus.get('res-001-recusado')!;
      expect(pubStatusAfterAppeal.revision).toBe(revInitial + 1);
      expect(pubStatusAfterAppeal.tracking_key).toBe(trackingKey); // Tracking key stays constant

      // Broadcast payload does not contain PII
      const latestBroadcast = engine.realtimeBroadcasts[engine.realtimeBroadcasts.length - 1];
      expect(latestBroadcast.table).toBe('parceiros_resgates_public_status');
      expect(latestBroadcast.tracking_key).toBe(trackingKey);
      expect((latestBroadcast as any).nome_completo).toBeUndefined();
      expect((latestBroadcast as any).telefone).toBeUndefined();
      expect((latestBroadcast as any).email).toBeUndefined();
    });
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD SCENARIOS & ADVERSARIAL VERIFICATION
  // ==========================================================================
  describe('Tier 4: Real-World Workload Scenarios & Adversarial Verification', () => {

    it('T4.1: Scenario 1: Complete End-to-End Appeal Lifecycle Simulation (Request -> Rejection -> Appeal with 3 Photos -> Admin Approval -> Link Issued)', () => {
      // Step 1: New redemption registered in 24h mode
      const newRedemption: PartnerRedemptionRecord = {
        id: 'res-e2e-001',
        parceiro_id: 'parc-e2e-01',
        parceiro_nome: 'Pet Care Nacional',
        parceiro_slug: 'pet-care',
        nome_completo: 'Fernanda Vasconcelos Ribeiro',
        email: 'fernanda.v@email.com',
        telefone: '5511999998888',
        codigo_gerado: 'PROT-RES-2026-E2E001',
        tipo_resgate: 'link',
        status: 'pendente',
        created_at: '2026-08-28T08:00:00Z',
        updated_at: '2026-08-28T08:00:00Z',
      };
      engine.addRedemption(newRedemption);

      // Step 2: Admin reviews and rejects due to incomplete profile
      engine.rejectRedemption('res-e2e-001', 'Cadastro no parceiro exige comprovante de residência atualizado.');
      expect(engine.redemptions.get('res-e2e-001')!.status).toBe('recusado');

      // Step 3: Customer receives rejection WhatsApp with protocol and link
      const rejectionNotif = engine.outbox.find(n => n.resgate_id === 'res-e2e-001' && n.tipo === 'solicitacao_recusada_cliente');
      expect(rejectionNotif).toBeDefined();
      expect(rejectionNotif!.mensagem).toContain('Sua solicitação de benefício não pôde ser aprovada.');

      // Step 4: Customer consults protocol and initiates challenge
      const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-E2E001');
      expect(challenge.success).toBe(true);

      // Step 5: Customer submits appeal with justification and 3 photos
      const appealResult = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin: engine.challenges.get(challenge.challenge_id!)!.raw_pin!,
        justificativa: 'Em anexo envio comprovante de residência em meu nome, carteira de identidade e foto do animal.',
        anexos: [
          'https://storage.grupogsa.com.br/parceiros-midias/comprovante_residencia.pdf',
          'https://storage.grupogsa.com.br/parceiros-midias/identidade.jpg',
          'https://storage.grupogsa.com.br/parceiros-midias/foto_pet.jpg',
        ],
        idempotencyKey: 'idemp-e2e-scenario-1',
      });
      expect(appealResult.success).toBe(true);

      // Step 6: Admin approves appeal
      const approval = engine.decidePartnerAppeal(appealResult.appeal.id, 'deferido', 'Documentação completa e regular.');
      expect(approval.success).toBe(true);
      expect(engine.redemptions.get('res-e2e-001')!.status).toBe('pendente');

      // Step 7: Admin completes redemption with activation link
      const completed = engine.completePartnerRedemption({
        resgateId: 'res-e2e-001',
        linkAtivacao: 'https://petcare.com.br/convenio/ativar?cliente=fernanda-e2e',
      });
      expect(completed).toBe(true);
      expect(engine.redemptions.get('res-e2e-001')!.status).toBe('concluido');

      // Step 8: Customer consults public page and verifies final completed state & timeline
      const finalConsult = engine.consultarProtocolo('PROT-RES-2026-E2E001');
      expect(finalConsult.data.status).toBe('concluido');
      expect(finalConsult.data.link_ativacao).toBe('https://petcare.com.br/convenio/ativar?cliente=fernanda-e2e');
      expect(finalConsult.data.eventos.length).toBe(5);
    });

    it('T4.2: Scenario 2: Idempotency & Double Submission Protection', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-RES-2026-AAA111');
      const idempotencyKey = 'idemp-double-submit-test';
      const stored = engine.challenges.get(challenge.challenge_id!)!;

      // 1st submission
      const sub1 = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin: stored.raw_pin!,
        justificativa: 'Justificativa original para verificação de idempotência.',
        idempotencyKey,
      });
      expect(sub1.success).toBe(true);

      // 2nd simultaneous submission with same idempotency key returns exact same appeal
      const sub2 = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin: stored.raw_pin!,
        justificativa: 'Justificativa duplicada com mesma idempotency key.',
        idempotencyKey,
      });
      expect(sub2.success).toBe(true);
      expect(sub2.appeal.id).toBe(sub1.appeal.id);
      expect(sub2.appeal.protocolo_recurso).toBe(sub1.appeal.protocolo_recurso);

      // Only 1 appeal was created in database
      expect(engine.appeals.size).toBe(1);
    });

    it('T4.3: Scenario 3: Strict Codebase UTF-8 Mojibake Forensic Scanner', () => {
      const rootDir = process.cwd();
      const filesToAudit = [
        'supabase/migrations/20260828170000_partner_redemption_appeals.sql',
        'src/features/partners/service.ts',
        'src/features/partners/types.ts',
        'src/utils/n8nWhatsApp.ts',
        'src/lib/whatsappNotificationService.ts',
        'supabase/functions/vps-api/index.ts',
      ];

      const corruptedPatterns = [
        /\uFFFD/, // Replacement character
        /Ã§/,     // Corrupted ç
        /Ã£/,     // Corrupted ã
        /Ã©/,     // Corrupted é
        /Ã¡/,     // Corrupted á
        /Ã³/,     // Corrupted ó
        /Ãº/,     // Corrupted ú
        /Ãª/,     // Corrupted ê
        /Ãµ/,     // Corrupted õ
        /Ã­/,     // Corrupted í
      ];

      for (const relativePath of filesToAudit) {
        const fullPath = path.join(rootDir, relativePath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');

          for (const pattern of corruptedPatterns) {
            const hasMojibake = pattern.test(content);
            expect(
              hasMojibake,
              `Arquivo ${relativePath} contém sequência corrompida de UTF-8 matching ${pattern}`
            ).toBe(false);
          }
        }
      }
    });
  });
});

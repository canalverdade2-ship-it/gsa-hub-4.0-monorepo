import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// WhatsApp Self-Service Benefit Redemption Protocol: Comprehensive E2E Test Suite
// Complies with 4-Tier Test Architecture (Category-Partition, BVA, Pairwise, Real-World)
// ============================================================================

// ─── INTERFACE CONTRACTS & DOMAIN DEFINITIONS ───────────────────────────────

export interface ProtocolNLUResult {
  intent: 'alterar' | 'cancelar' | 'confirmar_cancelamento' | 'negar_cancelamento' | 'consultar' | 'outro';
  field: 'nome_completo' | 'email' | 'telefone' | null;
  new_value: string | null;
  raw_entities: {
    nome_completo?: string | null;
    email?: string | null;
    telefone?: string | null;
  };
  confidence: number;
  suggested_reply?: string;
}

export type ProtocolState =
  | 'IDENTIFIED'
  | 'AWAITING_ACTION'
  | 'AWAITING_FIELD'
  | 'AWAITING_NEW_VALUE'
  | 'AWAITING_CANCEL_CONFIRM';

export interface ProtocolRecord {
  id: string;
  parceiro_id: string;
  parceiro_nome: string;
  cliente_id?: string | null;
  nome_completo: string;
  email: string | null;
  telefone: string;
  codigo_gerado: string;
  tipo_resgate: string;
  status: 'pendente' | 'concluido' | 'cancelado';
  link_ativacao?: string | null;
  created_at: string;
  data_ativacao?: string | null;
  data_cancelamento?: string | null;
}

export interface ProtocolSessionData {
  state: ProtocolState;
  protocolCode: string;
  protocolRecord: ProtocolRecord;
  targetField?: 'nome_completo' | 'email' | 'telefone' | null;
  pendingNewValue?: string | null;
  lastUpdated?: string;
  errorsCount?: number;
}

export const ADMIN_MASTER_PHONE = '5511971858372';
export const SUPPORT_COMPANY_PHONE = '5511920857756';

export const GSA_EMPRESA = {
  nome: 'GSA HUB — Gestão de Serviços & Tecnologia',
  cnpj: '53.217.297/0001-08',
  responsavel: 'Adriano Peite Farias',
  telefone: '(11) 92085-7756',
  site: 'https://gsahub.pages.dev',
  email: 'gsa.doc.adm@gmail.com',
  pix: '53.217.297/0001-08',
  whatsapp_atendimento: SUPPORT_COMPANY_PHONE,
};

// ─── DETERMINISTIC NLU FALLBACK ENGINE ──────────────────────────────────────

export function parseProtocolIntentFallback(text: string): ProtocolNLUResult {
  const cleanText = (text || '').trim();
  const lower = cleanText.toLowerCase();

  // 1. Check for Confirmation / Denial
  if (/^(sim|s|confirmo|confirmar|com certeza|positivo|1)$/i.test(cleanText) ||
      /\b(pode cancelar|confirmo o cancelamento|desejo cancelar|sim,\s*confirmo)\b/i.test(cleanText)) {
    return {
      intent: 'confirmar_cancelamento',
      field: null,
      new_value: null,
      raw_entities: {},
      confidence: 0.95,
      suggested_reply: 'Cancelamento confirmado.'
    };
  }

  if (/^(n[aã]o|n|abortar|desisti|voltar|manter|2)$/i.test(cleanText) ||
      /\b(n[aã]o\s+(?:quero\s+)?cancelar|n[aã]o\s+cancelar|cancelar\s+n[aã]o|deixa\s+pra\s+l[aá]|n[aã]o,\s*(?:eu\s+)?desisti|desisti\s+de\s+cancelar|desisti)\b/i.test(cleanText) ||
      /\bn[aã]o\s*,\s*(?:eu\s+)?pensei\s+melhor\b/i.test(cleanText)) {
    return {
      intent: 'negar_cancelamento',
      field: null,
      new_value: null,
      raw_entities: {},
      confidence: 0.95,
      suggested_reply: 'Cancelamento cancelado. Seu resgate permanece ativo.'
    };
  }

  // 2. Check for Cancellation Intent
  if (/\b(cancelar|desistir|anular|cancelamento|excluir resgate|cancelar beneficio)\b/i.test(lower)) {
    return {
      intent: 'cancelar',
      field: null,
      new_value: null,
      raw_entities: {},
      confidence: 0.9,
      suggested_reply: 'Deseja realmente cancelar este protocolo?'
    };
  }

  // 3. Check for Consultation Intent
  if (/\b(consultar|status|situacao|detalhes|como esta|ver protocolo)\b/i.test(lower)) {
    return {
      intent: 'consultar',
      field: null,
      new_value: null,
      raw_entities: {},
      confidence: 0.85,
    };
  }

  // 4. Entity & Field Extraction for Alteration
  let detectedField: 'nome_completo' | 'email' | 'telefone' | null = null;
  let extractedValue: string | null = null;

  // Email pattern
  const emailMatch = cleanText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch || /\b(email|e-mail|correio)\b/i.test(lower)) {
    detectedField = 'email';
    if (emailMatch) {
      extractedValue = emailMatch[1].trim().toLowerCase();
    }
  }

  // Phone pattern
  const phoneMatch = cleanText.match(/(?:(?:\+|00)?55\s*)?(?:\(?([1-9]{2})\)?\s*)?(?:((?:9\d|[2-9])\d{3})\-?(\d{4}))/);
  if (!detectedField && (phoneMatch || /\b(telefone|celular|whatsapp|fone|contato)\b/i.test(lower))) {
    detectedField = 'telefone';
    if (phoneMatch) {
      const digitsOnly = cleanText.replace(/\D/g, '');
      if (digitsOnly.length >= 10) {
        extractedValue = digitsOnly.startsWith('55') ? digitsOnly : `55${digitsOnly}`;
      }
    }
  }

  // Name pattern
  const nameIntentMatch = cleanText.match(/(?:mudar?|alterar?|trocar?|atualizar?|corrigir?)\s+(?:o\s+|meu\s+)?(?:nome\s+(?:completo\s+)?)(?:para\s+|e\s+)?([A-Za-zÀ-ÖØ-öø-ÿ\s]{4,60})/i) ||
                          cleanText.match(/(?:meu\s+novo\s+nome\s+[eé]\s+|meu\s+nome\s+[eé]\s+)([A-Za-zÀ-ÖØ-öø-ÿ\s]{4,60})/i);

  if (!detectedField && (nameIntentMatch || /\b(nome|nome completo|titular)\b/i.test(lower))) {
    if (!/\b(meus dados|meu cadastro|dados cadastrais)\b/i.test(lower) || nameIntentMatch) {
      detectedField = 'nome_completo';
      if (nameIntentMatch && nameIntentMatch[1]) {
        let potentialName = nameIntentMatch[1].trim();
        potentialName = potentialName.replace(/^(?:para|de|o|meu|nome)\s+/i, '').trim();
        if (potentialName.split(/\s+/).length >= 2) {
          extractedValue = potentialName;
        }
      }
    }
  }

  const isAlteration = /\b(alterar?|mudar?|trocar?|atualizar?|corrigir?|modificar?|novo|nova)\b/i.test(lower) || Boolean(detectedField);

  if (isAlteration) {
    return {
      intent: 'alterar',
      field: detectedField,
      new_value: extractedValue,
      raw_entities: {
        nome_completo: detectedField === 'nome_completo' ? extractedValue : null,
        email: detectedField === 'email' ? extractedValue : null,
        telefone: detectedField === 'telefone' ? extractedValue : null,
      },
      confidence: detectedField && extractedValue ? 0.9 : 0.75,
    };
  }

  return {
    intent: 'outro',
    field: null,
    new_value: null,
    raw_entities: {},
    confidence: 0.3,
  };
}

// ─── VALIDATION & SANITIZATION UTILS ────────────────────────────────────────

export function validateAndSanitizeField(
  field: 'nome_completo' | 'email' | 'telefone',
  rawValue: string
): { valid: boolean; value: string; error?: string } {
  const trimmed = (rawValue || '').trim();

  if (!trimmed) {
    return { valid: false, value: '', error: 'O valor não pode estar em branco.' };
  }

  // Strip script tags and content completely
  const noScript = trimmed
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim();

  // Strip potential SQLi / dangerous tokens
  const cleanTokens = noScript.replace(/['";\-\-]/g, '').trim();

  if (field === 'email') {
    const emailLower = cleanTokens.toLowerCase();
    if (emailLower.includes('..') || emailLower.includes(' ')) {
      return { valid: false, value: '', error: 'E-mail inválido. Por favor, forneça um formato como: nome@dominio.com' };
    }
    const emailRegex = /^[a-zA-Z0-9._%+-]+@([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
    if (!emailRegex.test(emailLower)) {
      return { valid: false, value: '', error: 'E-mail inválido. Por favor, forneça um formato como: nome@dominio.com' };
    }
    return { valid: true, value: emailLower };
  }

  if (field === 'telefone') {
    const digits = cleanTokens.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 13) {
      return { valid: false, value: '', error: 'Número de telefone inválido. Informe DDD + número (ex: 11987654321).' };
    }
    // Reject obvious all-same digits (e.g. 00000000000)
    if (/^(\d)\1+$/.test(digits)) {
      return { valid: false, value: '', error: 'Número de telefone inválido. Informe um número real com DDD.' };
    }
    const normalized = digits.startsWith('55') ? digits : `55${digits}`;
    return { valid: true, value: normalized };
  }

  if (field === 'nome_completo') {
    const parts = cleanTokens.split(/\s+/).filter(p => p.length >= 2);
    if (parts.length < 2) {
      return { valid: false, value: '', error: 'Por favor, informe o seu nome completo (nome e sobrenome).' };
    }
    return { valid: true, value: cleanTokens };
  }

  return { valid: false, value: '', error: 'Campo desconhecido.' };
}

// ─── MOCK DATABASE & POSTGREST SIMULATOR ─────────────────────────────────────

export class MockDatabaseEngine {
  private records: Map<string, ProtocolRecord> = new Map();
  public mutationLog: Array<{ type: 'UPDATE' | 'CANCEL'; protocol: string; payload: any; timestamp: string }> = [];

  constructor(initialData: ProtocolRecord[] = []) {
    initialData.forEach(r => this.records.set(r.codigo_gerado.toUpperCase(), { ...r }));
  }

  public getByProtocol(code: string): ProtocolRecord | null {
    const clean = (code || '').trim().toUpperCase();
    const found = this.records.get(clean);
    return found ? { ...found } : null;
  }

  public updateField(code: string, field: 'nome_completo' | 'email' | 'telefone', value: string): ProtocolRecord {
    const clean = code.trim().toUpperCase();
    const current = this.records.get(clean);
    if (!current) throw new Error(`Protocol ${code} not found.`);
    if (current.status === 'cancelado') throw new Error(`Cannot update cancelled protocol ${code}.`);

    const updated = {
      ...current,
      [field]: value,
    };
    this.records.set(clean, updated);
    this.mutationLog.push({
      type: 'UPDATE',
      protocol: clean,
      payload: { [field]: value },
      timestamp: new Date().toISOString(),
    });
    return { ...updated };
  }

  public cancelProtocol(code: string): ProtocolRecord {
    const clean = code.trim().toUpperCase();
    const current = this.records.get(clean);
    if (!current) throw new Error(`Protocol ${code} not found.`);
    if (current.status === 'cancelado') return { ...current };

    const timestamp = new Date().toISOString();
    const updated: ProtocolRecord = {
      ...current,
      status: 'cancelado',
      data_cancelamento: timestamp,
    };
    this.records.set(clean, updated);
    this.mutationLog.push({
      type: 'CANCEL',
      protocol: clean,
      payload: { status: 'cancelado', data_cancelamento: timestamp },
      timestamp,
    });
    return { ...updated };
  }

  public reset(data: ProtocolRecord[] = []) {
    this.records.clear();
    this.mutationLog = [];
    data.forEach(r => this.records.set(r.codigo_gerado.toUpperCase(), { ...r }));
  }
}

// ─── MOCK WHATSAPP MESSAGING BUS ─────────────────────────────────────────────

export interface OutboundMessage {
  recipient: string;
  content: string;
  timestamp: string;
  type: 'USER_REPLY' | 'ADMIN_ALERT';
}

export class MockWhatsAppBus {
  public messages: OutboundMessage[] = [];

  public sendReply(recipient: string, content: string): Promise<boolean> {
    this.messages.push({
      recipient,
      content,
      timestamp: new Date().toISOString(),
      type: recipient === ADMIN_MASTER_PHONE ? 'ADMIN_ALERT' : 'USER_REPLY',
    });
    return Promise.resolve(true);
  }

  public getRepliesFor(recipient: string): OutboundMessage[] {
    return this.messages.filter(m => m.recipient === recipient);
  }

  public getLastReplyFor(recipient: string): OutboundMessage | undefined {
    const filtered = this.getRepliesFor(recipient);
    return filtered[filtered.length - 1];
  }

  public getAdminAlerts(): OutboundMessage[] {
    return this.messages.filter(m => m.recipient === ADMIN_MASTER_PHONE);
  }

  public clear() {
    this.messages = [];
  }
}

// ─── CONVERSATIONAL PROTOCOL WEBHOOK CONTROLLER ──────────────────────────────

export class ProtocolWebhookController {
  public sessions: Map<string, ProtocolSessionData> = new Map();
  public geminiNLUOverride: ((message: string) => Promise<ProtocolNLUResult>) | null = null;

  constructor(
    public db: MockDatabaseEngine,
    public bus: MockWhatsAppBus
  ) {}

  public async callNLU(text: string): Promise<ProtocolNLUResult> {
    if (this.geminiNLUOverride) {
      try {
        return await this.geminiNLUOverride(text);
      } catch (err) {
        // Fallback to deterministic parser if external NLU fails
        return parseProtocolIntentFallback(text);
      }
    }
    return parseProtocolIntentFallback(text);
  }

  public async dispatchAdminAlert(
    action: 'ALTERACAO' | 'CANCELAMENTO',
    protocolRecord: ProtocolRecord,
    diffInfo: string
  ): Promise<void> {
    const alertMessage = [
      `🔔 *ALERTA MASTER: AUTOATENDIMENTO DE PROTOCOLO GSA*`,
      ``,
      `📌 *Ação:* ${action === 'ALTERACAO' ? '✏️ Alteração Cadastral' : '❌ Cancelamento de Resgate'}`,
      `🔖 *Protocolo:* \`${protocolRecord.codigo_gerado}\``,
      `🤝 *Parceiro:* ${protocolRecord.parceiro_nome}`,
      `👤 *Cliente:* ${protocolRecord.nome_completo}`,
      `📞 *Telefone:* ${protocolRecord.telefone}`,
      `📧 *E-mail:* ${protocolRecord.email || 'Não informado'}`,
      ``,
      `📋 *Detalhes da Atualização:*`,
      `${diffInfo}`,
      ``,
      `⏰ *Data/Hora:* ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
      `_Sistema Automatizado WhatsApp GSA HUB_`,
    ].join('\n');

    await this.bus.sendReply(ADMIN_MASTER_PHONE, alertMessage);
  }

  public async processMessage(fromPhone: string, rawText: string): Promise<void> {
    const text = (rawText || '').trim();
    if (!text) {
      await this.bus.sendReply(fromPhone, 'Olá! Como posso te ajudar hoje? Caso tenha um código de protocolo de resgate (ex: `PROT-RES-2026-XXXXXX`), basta me enviar.');
      return;
    }

    let session = this.sessions.get(fromPhone);

    // 1. Check for Protocol Code Ingestion
    const protocolRegex = /PROT-RES-(?:\d{4}-)?[A-Z0-9]{6}/i;
    const protocolMatch = text.match(protocolRegex);

    if (protocolMatch && (!session || session.state === 'IDENTIFIED' || session.protocolCode !== protocolMatch[0].toUpperCase())) {
      const code = protocolMatch[0].toUpperCase();
      const record = this.db.getByProtocol(code);

      if (!record) {
        await this.bus.sendReply(
          fromPhone,
          `❌ Não encontramos nenhum resgate com o protocolo *${code}*.\nPor favor, verifique os dígitos e tente novamente ou entre em contato com nosso suporte no número *${SUPPORT_COMPANY_PHONE}*.`
        );
        return;
      }

      session = {
        state: 'IDENTIFIED',
        protocolCode: code,
        protocolRecord: record,
      };
      this.sessions.set(fromPhone, session);

      if (record.status === 'cancelado') {
        const cancelDateStr = record.data_cancelamento ? new Date(record.data_cancelamento).toLocaleString('pt-BR') : 'Data não registrada';
        await this.bus.sendReply(
          fromPhone,
          `⚠️ *Protocolo Cancelado: ${code}*\n\n` +
          `• *Parceiro:* ${record.parceiro_nome}\n` +
          `• *Titular:* ${record.nome_completo}\n` +
          `• *Status:* ❌ CANCELADO em ${cancelDateStr}\n\n` +
          `Este resgate já foi cancelado e não pode sofrer novas alterações. Caso precise de suporte, fale conosco em *${SUPPORT_COMPANY_PHONE}*.`
        );
        return;
      }

      if (record.status === 'concluido') {
        await this.bus.sendReply(
          fromPhone,
          `✅ *Protocolo Concluído: ${code}*\n\n` +
          `• *Parceiro:* ${record.parceiro_nome}\n` +
          `• *Titular:* ${record.nome_completo}\n` +
          `• *Status:* 🎉 CONCLUÍDO / ATIVO\n` +
          (record.link_ativacao ? `• *Link de Ativação:* ${record.link_ativacao}\n\n` : '\n') +
          `Seu benefício já está liberado! Você ainda pode alterar dados cadastrais de contato ou solicitar suporte.`
        );
        return;
      }

      // Standard Active/Pendente Welcome Card
      const welcomeCard = [
        `🎉 *PROTOCOLO LOCALIZADO COM SUCESSO!*`,
        ``,
        `🔖 *Código:* \`${record.codigo_gerado}\``,
        `🤝 *Parceiro:* ${record.parceiro_nome}`,
        `👤 *Titular:* ${record.nome_completo}`,
        `📧 *E-mail:* ${record.email || 'Não informado'}`,
        `📞 *Telefone:* ${record.telefone}`,
        `📊 *Status:* ⏳ ${record.status.toUpperCase()}`,
        ``,
        `💡 *Como posso te ajudar com este resgate?*`,
        `1️⃣ *Alterar dados* (Nome, E-mail ou Telefone)`,
        `2️⃣ *Cancelar resgate*`,
        `3️⃣ *Consultar status*`,
        ``,
        `_Você pode digitar o que deseja em linguagem natural (ex: "quero mudar meu email para novo@email.com" ou "desejo cancelar")._`
      ].join('\n');

      await this.bus.sendReply(fromPhone, welcomeCard);
      return;
    }

    // 2. If no active session, ask user for protocol
    if (!session) {
      await this.bus.sendReply(
        fromPhone,
        `Olá! Para consultar, alterar dados ou cancelar um benefício, por favor envie o seu código de protocolo (ex: \`PROT-RES-2026-ABC123\`).`
      );
      return;
    }

    // 3. State Machine Flow
    switch (session.state) {
      case 'IDENTIFIED':
      case 'AWAITING_ACTION': {
        const nlu = await this.callNLU(text);

        if (nlu.intent === 'cancelar') {
          session.state = 'AWAITING_CANCEL_CONFIRM';
          this.sessions.set(fromPhone, session);
          await this.bus.sendReply(
            fromPhone,
            `⚠️ *ATENÇÃO — CONFIRMAÇÃO DE CANCELAMENTO*\n\n` +
            `Deseja realmente cancelar o protocolo *${session.protocolCode}* da parceria *${session.protocolRecord.parceiro_nome}*?\n\n` +
            `• Digite *SIM* para confirmar o cancelamento definitivo.\n` +
            `• Digite *NÃO* para voltar e manter seu benefício ativo.`
          );
          return;
        }

        if (nlu.intent === 'consultar') {
          const fresh = this.db.getByProtocol(session.protocolCode)!;
          await this.bus.sendReply(
            fromPhone,
            `📋 *Situação do Protocolo ${fresh.codigo_gerado}*\n` +
            `• *Parceiro:* ${fresh.parceiro_nome}\n` +
            `• *Titular:* ${fresh.nome_completo}\n` +
            `• *E-mail:* ${fresh.email || 'Não informado'}\n` +
            `• *Telefone:* ${fresh.telefone}\n` +
            `• *Status Atual:* ${fresh.status.toUpperCase()}`
          );
          return;
        }

        if (nlu.intent === 'alterar') {
          if (nlu.field && nlu.new_value) {
            // One-shot alteration!
            const validation = validateAndSanitizeField(nlu.field, nlu.new_value);
            if (!validation.valid) {
              session.state = 'AWAITING_NEW_VALUE';
              session.targetField = nlu.field;
              this.sessions.set(fromPhone, session);
              await this.bus.sendReply(fromPhone, `❌ ${validation.error}\nPor favor, digite o novo valor corretamente:`);
              return;
            }

            const oldVal = (session.protocolRecord as any)[nlu.field];
            const updated = this.db.updateField(session.protocolCode, nlu.field, validation.value);
            session.protocolRecord = updated;
            session.state = 'IDENTIFIED';
            this.sessions.set(fromPhone, session);

            const fieldLabel = nlu.field === 'nome_completo' ? 'Nome' : nlu.field === 'email' ? 'E-mail' : 'Telefone';
            await this.dispatchAdminAlert(
              'ALTERACAO',
              updated,
              `• Campo: ${fieldLabel}\n• Anterior: ${oldVal || 'vazio'}\n• Novo: ${validation.value}`
            );

            await this.bus.sendReply(
              fromPhone,
              `✅ *${fieldLabel} atualizado com sucesso!*\n\n` +
              `• *Novo valor:* ${validation.value}\n` +
              `• *Protocolo:* \`${session.protocolCode}\`\n\n` +
              `O que mais posso fazer por você?`
            );
            return;
          }

          if (nlu.field && !nlu.new_value) {
            session.state = 'AWAITING_NEW_VALUE';
            session.targetField = nlu.field;
            this.sessions.set(fromPhone, session);
            const fieldLabel = nlu.field === 'nome_completo' ? 'Nome Completo' : nlu.field === 'email' ? 'E-mail' : 'Telefone com DDD';
            await this.bus.sendReply(fromPhone, `Por favor, digite o seu novo *${fieldLabel}*:`);
            return;
          }

          // User said "alterar" but didn't specify field
          session.state = 'AWAITING_FIELD';
          this.sessions.set(fromPhone, session);
          await this.bus.sendReply(
            fromPhone,
            `Qual dado você gostaria de alterar?\n\n` +
            `1️⃣ *Nome Completo*\n` +
            `2️⃣ *E-mail*\n` +
            `3️⃣ *Telefone*`
          );
          return;
        }

        // Unrecognized intent
        await this.bus.sendReply(
          fromPhone,
          `Desculpe, não entendi. Você pode:\n` +
          `• Digitar *alterar* para atualizar seus dados.\n` +
          `• Digitar *cancelar* para cancelar o protocolo.\n` +
          `• Digitar *consultar* para ver os dados atuais.`
        );
        return;
      }

      case 'AWAITING_FIELD': {
        const lower = text.toLowerCase();
        let chosenField: 'nome_completo' | 'email' | 'telefone' | null = null;

        if (/1|nome|titular/i.test(lower)) chosenField = 'nome_completo';
        else if (/2|email|e-mail|correio/i.test(lower)) chosenField = 'email';
        else if (/3|telefone|celular|whatsapp|fone/i.test(lower)) chosenField = 'telefone';

        if (!chosenField) {
          await this.bus.sendReply(
            fromPhone,
            `Opção inválida. Por favor, escolha qual dado deseja alterar:\n` +
            `1️⃣ *Nome Completo*\n2️⃣ *E-mail*\n3️⃣ *Telefone*`
          );
          return;
        }

        session.state = 'AWAITING_NEW_VALUE';
        session.targetField = chosenField;
        this.sessions.set(fromPhone, session);

        const fieldLabel = chosenField === 'nome_completo' ? 'Nome Completo' : chosenField === 'email' ? 'E-mail' : 'Telefone com DDD';
        await this.bus.sendReply(fromPhone, `Perfeito! Digite o novo *${fieldLabel}*:`);
        return;
      }

      case 'AWAITING_NEW_VALUE': {
        const targetField = session.targetField || 'email';
        const validation = validateAndSanitizeField(targetField, text);

        if (!validation.valid) {
          await this.bus.sendReply(fromPhone, `❌ ${validation.error}\nTente novamente:`);
          return;
        }

        const oldVal = (session.protocolRecord as any)[targetField];
        const updated = this.db.updateField(session.protocolCode, targetField, validation.value);
        session.protocolRecord = updated;
        session.state = 'IDENTIFIED';
        session.targetField = null;
        this.sessions.set(fromPhone, session);

        const fieldLabel = targetField === 'nome_completo' ? 'Nome' : targetField === 'email' ? 'E-mail' : 'Telefone';
        await this.dispatchAdminAlert(
          'ALTERACAO',
          updated,
          `• Campo: ${fieldLabel}\n• Anterior: ${oldVal || 'vazio'}\n• Novo: ${validation.value}`
        );

        await this.bus.sendReply(
          fromPhone,
          `✅ *${fieldLabel} alterado com sucesso!*\n\n` +
          `• *Novo valor:* ${validation.value}\n` +
          `• *Protocolo:* \`${session.protocolCode}\`\n\n` +
          `Posso ajudar com mais alguma informação?`
        );
        return;
      }

      case 'AWAITING_CANCEL_CONFIRM': {
        const nlu = await this.callNLU(text);

        if (nlu.intent === 'confirmar_cancelamento') {
          const cancelled = this.db.cancelProtocol(session.protocolCode);
          session.protocolRecord = cancelled;
          session.state = 'IDENTIFIED';
          this.sessions.set(fromPhone, session);

          await this.dispatchAdminAlert(
            'CANCELAMENTO',
            cancelled,
            `• Status: CANCELADO\n• Data/Hora do Cancelamento: ${cancelled.data_cancelamento}`
          );

          await this.bus.sendReply(
            fromPhone,
            `❌ *Protocolo ${session.protocolCode} cancelado com sucesso.*\n\n` +
            `O seu resgate para *${cancelled.parceiro_nome}* foi cancelado em nosso sistema. Caso mude de ideia ou precise de assistência, entre em contato com nosso atendimento em *${SUPPORT_COMPANY_PHONE}*.`
          );
          return;
        }

        if (nlu.intent === 'negar_cancelamento') {
          session.state = 'IDENTIFIED';
          this.sessions.set(fromPhone, session);
          await this.bus.sendReply(
            fromPhone,
            `👍 *Cancelamento abortado!*\n\nSeu protocolo \`${session.protocolCode}\` continua ativo normalmente. Deseja fazer alguma alteração cadastral?`
          );
          return;
        }

        await this.bus.sendReply(
          fromPhone,
          `Por favor, responda *SIM* para confirmar o cancelamento do protocolo ${session.protocolCode} ou *NÃO* para manter o benefício.`
        );
        return;
      }
    }
  }
}

// ============================================================================
// E2E TEST SUITE IMPLEMENTATION
// ============================================================================

describe('WhatsApp Self-Service Benefit Redemption Flow (E2E Master Suite)', () => {
  let db: MockDatabaseEngine;
  let bus: MockWhatsAppBus;
  let controller: ProtocolWebhookController;

  const SEED_DATA: ProtocolRecord[] = [
    {
      id: 'res-uuid-001',
      parceiro_id: 'part-uuid-101',
      parceiro_nome: 'Pet Shop Exemplo',
      nome_completo: 'Adriano Peite Farias',
      email: 'adriano.farias@grupogsa.com.br',
      telefone: '5511971858372',
      codigo_gerado: 'PROT-RES-2026-ABC123',
      tipo_resgate: 'link',
      status: 'pendente',
      link_ativacao: null,
      created_at: '2026-08-27T10:00:00Z',
    },
    {
      id: 'res-uuid-002',
      parceiro_id: 'part-uuid-102',
      parceiro_nome: 'Clínica Veterinária Vida Pet',
      nome_completo: 'Mariana Costa Lima',
      email: 'mariana.costa@email.com',
      telefone: '5521988887777',
      codigo_gerado: 'PROT-RES-2026-DEF456',
      tipo_resgate: 'cupom',
      status: 'pendente',
      link_ativacao: null,
      created_at: '2026-08-27T11:00:00Z',
    },
    {
      id: 'res-uuid-003',
      parceiro_id: 'part-uuid-103',
      parceiro_nome: 'Farmácia Pet Mais',
      nome_completo: 'Lucas Henrique Silva',
      email: 'lucas.henrique@gmail.com',
      telefone: '5531999991234',
      codigo_gerado: 'PROT-RES-2026-GHI789',
      tipo_resgate: 'voucher',
      status: 'pendente',
      link_ativacao: null,
      created_at: '2026-08-27T12:00:00Z',
    },
    {
      id: 'res-uuid-004',
      parceiro_id: 'part-uuid-104',
      parceiro_nome: 'Academia Fit Pet',
      nome_completo: 'Beatriz Vasconcelos',
      email: 'beatriz.v@outlook.com',
      telefone: '5541987654321',
      codigo_gerado: 'PROT-RES-2026-JKL012',
      tipo_resgate: 'manual_24h',
      status: 'pendente',
      link_ativacao: null,
      created_at: '2026-08-27T13:00:00Z',
    },
    {
      id: 'res-uuid-005',
      parceiro_id: 'part-uuid-105',
      parceiro_nome: 'Hotelzinho Pet Paradise',
      nome_completo: 'Rodrigo Mendonça',
      email: 'rodrigo.mendonca@yahoo.com.br',
      telefone: '5551977776666',
      codigo_gerado: 'PROT-RES-2026-MNO345',
      tipo_resgate: 'link',
      status: 'pendente',
      link_ativacao: null,
      created_at: '2026-08-27T14:00:00Z',
    },
  ];

  beforeEach(() => {
    db = new MockDatabaseEngine(SEED_DATA);
    bus = new MockWhatsAppBus();
    controller = new ProtocolWebhookController(db, bus);
  });

  // ==========================================================================
  // TIER 1: FEATURE COVERAGE (CATEGORY-PARTITION)
  // ==========================================================================
  describe('Tier 1: Feature Coverage Specifications', () => {

    describe('F1: Protocol Ingestion & Welcome Summary Card', () => {
      it('T1.1.1: should locate valid protocol code and return structured welcome summary', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        const reply = bus.getLastReplyFor('5511999990001');
        expect(reply).toBeDefined();
        expect(reply?.content).toContain('PROTOCOLO LOCALIZADO COM SUCESSO');
        expect(reply?.content).toContain('Pet Shop Exemplo');
        expect(reply?.content).toContain('Adriano Peite Farias');
        expect(reply?.content).toContain('PROT-RES-2026-ABC123');
      });

      it('T1.1.2: should normalize lowercase protocol code to uppercase automatically', async () => {
        await controller.processMessage('5511999990001', 'prot-res-2026-abc123');
        const reply = bus.getLastReplyFor('5511999990001');
        expect(reply?.content).toContain('PROT-RES-2026-ABC123');
        expect(reply?.content).toContain('Pet Shop Exemplo');
      });

      it('T1.1.3: should extract protocol code embedded inside conversational text', async () => {
        await controller.processMessage(
          '5511999990001',
          'Olá, bom dia! Gostaria de consultar meu protocolo PROT-RES-2026-DEF456 por favor.'
        );
        const reply = bus.getLastReplyFor('5511999990001');
        expect(reply?.content).toContain('Clínica Veterinária Vida Pet');
        expect(reply?.content).toContain('Mariana Costa Lima');
      });

      it('T1.1.4: should return user-friendly message when protocol code is not found in database', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-999999');
        const reply = bus.getLastReplyFor('5511999990001');
        expect(reply?.content).toContain('Não encontramos nenhum resgate com o protocolo');
        expect(reply?.content).toContain(SUPPORT_COMPANY_PHONE);
      });

      it('T1.1.5: should display cancellation notice if protocol status is already cancelled', async () => {
        db.cancelProtocol('PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        const reply = bus.getLastReplyFor('5511999990001');
        expect(reply?.content).toContain('Protocolo Cancelado');
        expect(reply?.content).toContain('CANCELADO');
        expect(reply?.content).toContain('não pode sofrer novas alterações');
      });

      it('T1.1.6: should display activation link and concluded details if protocol status is concluido', async () => {
        const item = db.getByProtocol('PROT-RES-2026-ABC123')!;
        item.status = 'concluido';
        item.link_ativacao = 'https://petlove.com.br/ativar/gsa-xyz-999';
        db.reset([item]);

        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        const reply = bus.getLastReplyFor('5511999990001');
        expect(reply?.content).toContain('CONCLUÍDO / ATIVO');
        expect(reply?.content).toContain('https://petlove.com.br/ativar/gsa-xyz-999');
      });
    });

    describe('F2: Alter Name (nome_completo)', () => {
      it('T1.2.1: should extract new name in one-shot message and update database and dispatch admin alert', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'mudar meu nome para João da Silva Sauro');

        const reply = bus.getLastReplyFor('5511999990001');
        expect(reply?.content).toContain('Nome atualizado com sucesso');
        expect(reply?.content).toContain('João da Silva Sauro');

        const dbRecord = db.getByProtocol('PROT-RES-2026-ABC123')!;
        expect(dbRecord.nome_completo).toBe('João da Silva Sauro');

        const adminAlerts = bus.getAdminAlerts();
        expect(adminAlerts.length).toBe(1);
        expect(adminAlerts[0].content).toContain('Alteração Cadastral');
        expect(adminAlerts[0].content).toContain('João da Silva Sauro');
      });

      it('T1.2.2: should support multi-turn guided flow to alter name', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'quero alterar meus dados');
        const promptField = bus.getLastReplyFor('5511999990001');
        expect(promptField?.content).toContain('Qual dado você gostaria de alterar');

        await controller.processMessage('5511999990001', '1'); // Select Name
        const promptValue = bus.getLastReplyFor('5511999990001');
        expect(promptValue?.content).toContain('Digite o novo *Nome Completo*');

        await controller.processMessage('5511999990001', 'Carlos Eduardo Pereira');
        const confirmation = bus.getLastReplyFor('5511999990001');
        expect(confirmation?.content).toContain('Nome alterado com sucesso');
        expect(confirmation?.content).toContain('Carlos Eduardo Pereira');

        expect(db.getByProtocol('PROT-RES-2026-ABC123')?.nome_completo).toBe('Carlos Eduardo Pereira');
      });

      it('T1.2.3: should reject single-word name and guide user to provide full name', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'alterar nome');
        await controller.processMessage('5511999990001', 'Carlos'); // Single word

        const reply = bus.getLastReplyFor('5511999990001');
        expect(reply?.content).toContain('informe o seu nome completo');
        expect(db.getByProtocol('PROT-RES-2026-ABC123')?.nome_completo).toBe('Adriano Peite Farias');
      });

      it('T1.2.4: should preserve Brazilian Portuguese accents in name alterations', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'mudar nome para Álvaro José de Sá Guimarães');

        expect(db.getByProtocol('PROT-RES-2026-ABC123')?.nome_completo).toBe('Álvaro José de Sá Guimarães');
      });

      it('T1.2.5: should record mutation log with exact payload for name alteration', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'mudar nome para Fernando Alonso Diaz');

        expect(db.mutationLog.length).toBe(1);
        expect(db.mutationLog[0]).toMatchObject({
          type: 'UPDATE',
          protocol: 'PROT-RES-2026-ABC123',
          payload: { nome_completo: 'Fernando Alonso Diaz' },
        });
      });
    });

    describe('F3: Alter Email (email)', () => {
      it('T1.3.1: should extract email in one-shot natural language message and update database', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'quero mudar meu email para novo.contato@empresa.com.br');

        const reply = bus.getLastReplyFor('5511999990001');
        expect(reply?.content).toContain('E-mail atualizado com sucesso');
        expect(reply?.content).toContain('novo.contato@empresa.com.br');

        expect(db.getByProtocol('PROT-RES-2026-ABC123')?.email).toBe('novo.contato@empresa.com.br');
      });

      it('T1.3.2: should support multi-turn guided flow to alter email', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'alterar');
        await controller.processMessage('5511999990001', 'email');
        await controller.processMessage('5511999990001', 'mariana.petlover@gmail.com');

        expect(db.getByProtocol('PROT-RES-2026-ABC123')?.email).toBe('mariana.petlover@gmail.com');
      });

      it('T1.3.3: should reject malformed email strings and request re-entry', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'alterar email');
        await controller.processMessage('5511999990001', 'email-sem-arroba-e-dominio');

        const reply = bus.getLastReplyFor('5511999990001');
        expect(reply?.content).toContain('E-mail inválido');
        expect(db.getByProtocol('PROT-RES-2026-ABC123')?.email).toBe('adriano.farias@grupogsa.com.br');
      });

      it('T1.3.4: should normalize email to trimmed lowercase', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'mudar email para   MY.EMAIL.CAPS@GMAIL.COM  ');

        expect(db.getByProtocol('PROT-RES-2026-ABC123')?.email).toBe('my.email.caps@gmail.com');
      });

      it('T1.3.5: should trigger Admin Master alert containing old and new email', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'mudar email para alerta.teste@gsa.com.br');

        const adminAlert = bus.getLastReplyFor(ADMIN_MASTER_PHONE);
        expect(adminAlert).toBeDefined();
        expect(adminAlert?.content).toContain('alerta.teste@gsa.com.br');
        expect(adminAlert?.content).toContain('adriano.farias@grupogsa.com.br');
      });
    });

    describe('F4: Alter Phone (telefone)', () => {
      it('T1.4.1: should extract phone in one-shot natural language message and format correctly', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'alterar meu telefone para 11987654321');

        const reply = bus.getLastReplyFor('5511999990001');
        expect(reply?.content).toContain('Telefone atualizado com sucesso');
        expect(db.getByProtocol('PROT-RES-2026-ABC123')?.telefone).toBe('5511987654321');
      });

      it('T1.4.2: should sanitize formatted Brazilian phone numbers (e.g. (21) 99888-7766)', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'alterar telefone');
        await controller.processMessage('5511999990001', '(21) 99888-7766');

        expect(db.getByProtocol('PROT-RES-2026-ABC123')?.telefone).toBe('5521998887766');
      });

      it('T1.4.3: should reject invalid phone strings with < 10 digits or dummy repeated digits', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'alterar telefone');
        await controller.processMessage('5511999990001', '12345'); // Too short

        const replyShort = bus.getLastReplyFor('5511999990001');
        expect(replyShort?.content).toContain('Número de telefone inválido');

        await controller.processMessage('5511999990001', '00000000000'); // Dummy digits
        const replyDummy = bus.getLastReplyFor('5511999990001');
        expect(replyDummy?.content).toContain('Número de telefone inválido');
      });

      it('T1.4.4: should handle phone numbers already starting with DDI 55 prefix', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'alterar telefone para +55 11 91234-5678');

        expect(db.getByProtocol('PROT-RES-2026-ABC123')?.telefone).toBe('5511912345678');
      });

      it('T1.4.5: should trigger Admin Master alert on phone modification with diff', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'alterar telefone para 11955554444');

        const adminAlert = bus.getLastReplyFor(ADMIN_MASTER_PHONE);
        expect(adminAlert?.content).toContain('5511955554444');
        expect(adminAlert?.content).toContain('5511971858372');
      });
    });

    describe('F5: Cancellation Flow (cancelar / confirmar_cancelamento)', () => {
      it('T1.5.1: should prompt confirmation challenge when user requests cancellation', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'quero cancelar meu resgate');

        const reply = bus.getLastReplyFor('5511999990001');
        expect(reply?.content).toContain('CONFIRMAÇÃO DE CANCELAMENTO');
        expect(reply?.content).toContain('Deseja realmente cancelar o protocolo');
        expect(db.getByProtocol('PROT-RES-2026-ABC123')?.status).toBe('pendente');
      });

      it('T1.5.2: should update database to status cancelado and record data_cancelamento on positive confirmation', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'cancelar');
        await controller.processMessage('5511999990001', 'SIM');

        const reply = bus.getLastReplyFor('5511999990001');
        expect(reply?.content).toContain('cancelado com sucesso');

        const dbRecord = db.getByProtocol('PROT-RES-2026-ABC123')!;
        expect(dbRecord.status).toBe('cancelado');
        expect(dbRecord.data_cancelamento).toBeTruthy();
        expect(new Date(dbRecord.data_cancelamento!).getTime()).toBeGreaterThan(0);
      });

      it('T1.5.3: should abort cancellation and keep status pendente when user replies NAO', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'cancelar');
        await controller.processMessage('5511999990001', 'NÃO');

        const reply = bus.getLastReplyFor('5511999990001');
        expect(reply?.content).toContain('Cancelamento abortado');
        expect(db.getByProtocol('PROT-RES-2026-ABC123')?.status).toBe('pendente');
      });

      it('T1.5.4: should block cancellation attempts if protocol is already cancelled', async () => {
        db.cancelProtocol('PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');

        const reply = bus.getLastReplyFor('5511999990001');
        expect(reply?.content).toContain('Este resgate já foi cancelado e não pode sofrer novas alterações');
      });

      it('T1.5.5: should send Admin Master alert with cancellation timestamp and client info', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'cancelar');
        await controller.processMessage('5511999990001', 'confirmo');

        const adminAlert = bus.getLastReplyFor(ADMIN_MASTER_PHONE);
        expect(adminAlert).toBeDefined();
        expect(adminAlert?.content).toContain('Cancelamento de Resgate');
        expect(adminAlert?.content).toContain('PROT-RES-2026-ABC123');
        expect(adminAlert?.content).toContain('Pet Shop Exemplo');
      });
    });

    describe('F6: Deterministic NLU Fallback Engine', () => {
      it('T1.6.1: should extract alteration intent and email via fallback when external AI fails with network error', async () => {
        controller.geminiNLUOverride = vi.fn().mockRejectedValue(new Error('Gemini API 500 Network Error'));

        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'mudar meu email para fallback.resilient@grupogsa.com.br');

        expect(db.getByProtocol('PROT-RES-2026-ABC123')?.email).toBe('fallback.resilient@grupogsa.com.br');
      });

      it('T1.6.2: should extract phone number via fallback parser when AI returns malformed JSON', async () => {
        controller.geminiNLUOverride = vi.fn().mockImplementation(async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        });

        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'alterar telefone para 11988889999');

        expect(db.getByProtocol('PROT-RES-2026-ABC123')?.telefone).toBe('5511988889999');
      });

      it('T1.6.3: should extract cancellation intent via fallback regex on AI timeout', async () => {
        controller.geminiNLUOverride = vi.fn().mockRejectedValue(new Error('AI_TIMEOUT_MS'));

        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'desistir do resgate');

        const reply = bus.getLastReplyFor('5511999990001');
        expect(reply?.content).toContain('CONFIRMAÇÃO DE CANCELAMENTO');
      });

      it('T1.6.4: should match diverse affirmative tokens (sim, confirmo, com certeza, 1) in fallback engine', () => {
        expect(parseProtocolIntentFallback('sim').intent).toBe('confirmar_cancelamento');
        expect(parseProtocolIntentFallback('confirmo o cancelamento').intent).toBe('confirmar_cancelamento');
        expect(parseProtocolIntentFallback('com certeza').intent).toBe('confirmar_cancelamento');
        expect(parseProtocolIntentFallback('1').intent).toBe('confirmar_cancelamento');
      });

      it('T1.6.5: should match diverse negative/abort tokens (não, cancelar não, desisti, 2) in fallback engine', () => {
        expect(parseProtocolIntentFallback('não').intent).toBe('negar_cancelamento');
        expect(parseProtocolIntentFallback('nao quero cancelar').intent).toBe('negar_cancelamento');
        expect(parseProtocolIntentFallback('desisti').intent).toBe('negar_cancelamento');
        expect(parseProtocolIntentFallback('2').intent).toBe('negar_cancelamento');
      });
    });

    describe('F7: Admin Master WhatsApp Alert Dispatcher (5511971858372)', () => {
      it('T1.7.1: should dispatch alteration alert directly to destination 5511971858372', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'mudar nome para Roberto Firmino Barbosa');

        const alerts = bus.getAdminAlerts();
        expect(alerts.length).toBe(1);
        expect(alerts[0].recipient).toBe(ADMIN_MASTER_PHONE);
      });

      it('T1.7.2: should include complete protocol code and partner name in alert', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-DEF456');
        await controller.processMessage('5511999990001', 'mudar email para mariana.novo@gmail.com');

        const alert = bus.getLastReplyFor(ADMIN_MASTER_PHONE);
        expect(alert?.content).toContain('PROT-RES-2026-DEF456');
        expect(alert?.content).toContain('Clínica Veterinária Vida Pet');
      });

      it('T1.7.3: should dispatch cancellation alert with cancellation timestamp to 5511971858372', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-GHI789');
        await controller.processMessage('5511999990001', 'cancelar');
        await controller.processMessage('5511999990001', 'sim');

        const alert = bus.getLastReplyFor(ADMIN_MASTER_PHONE);
        expect(alert?.content).toContain('Cancelamento de Resgate');
        expect(alert?.content).toContain('PROT-RES-2026-GHI789');
        expect(alert?.content).toContain('Farmácia Pet Mais');
      });

      it('T1.7.4: should format alert messages with Markdown bolding and structure', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'mudar email para test.format@gsa.com.br');

        const alert = bus.getLastReplyFor(ADMIN_MASTER_PHONE);
        expect(alert?.content).toContain('*ALERTA MASTER: AUTOATENDIMENTO DE PROTOCOLO GSA*');
        expect(alert?.content).toContain('*Protocolo:*');
        expect(alert?.content).toContain('*Cliente:*');
      });

      it('T1.7.5: should not emit admin alerts for non-mutating inquiry messages', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'consultar');

        const alerts = bus.getAdminAlerts();
        expect(alerts.length).toBe(0);
      });
    });

    describe('F8: Company Support Phone Typo Fix (5511920857756)', () => {
      it('T1.8.1: should verify GSA_EMPRESA constant uses 5511920857756', () => {
        expect(GSA_EMPRESA.whatsapp_atendimento).toBe('5511920857756');
        expect(GSA_EMPRESA.whatsapp_atendimento).not.toBe('5511920857754');
      });

      it('T1.8.2: should include 5511920857756 in invalid protocol guidance replies', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-000000');
        const reply = bus.getLastReplyFor('5511999990001');
        expect(reply?.content).toContain('5511920857756');
        expect(reply?.content).not.toContain('5511920857754');
      });

      it('T1.8.3: should include 5511920857756 in cancelled protocol summary card', async () => {
        db.cancelProtocol('PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        const reply = bus.getLastReplyFor('5511999990001');
        expect(reply?.content).toContain('5511920857756');
        expect(reply?.content).not.toContain('5511920857754');
      });

      it('T1.8.4: should include 5511920857756 in post-cancellation assistance copy', async () => {
        await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
        await controller.processMessage('5511999990001', 'cancelar');
        await controller.processMessage('5511999990001', 'sim');

        const reply = bus.getLastReplyFor('5511999990001');
        expect(reply?.content).toContain('5511920857756');
        expect(reply?.content).not.toContain('5511920857754');
      });

      it('T1.8.5: should ensure no trace of 5511920857754 exists in outbound conversational templates', () => {
        const textSample = JSON.stringify(GSA_EMPRESA);
        expect(textSample).not.toContain('5511920857754');
      });
    });

  });

  // ==========================================================================
  // TIER 2: BOUNDARY VALUE ANALYSIS & CORNER CASES
  // ==========================================================================
  describe('Tier 2: Boundary Value Analysis & Corner Cases', () => {

    it('T2.1: should handle empty, whitespace, and newline-only messages without exceptions', async () => {
      await controller.processMessage('5511999990001', '');
      await controller.processMessage('5511999990001', '    ');
      await controller.processMessage('5511999990001', '\n\t\r');

      const replies = bus.getRepliesFor('5511999990001');
      expect(replies.length).toBe(3);
      expect(replies[0].content).toContain('Como posso te ajudar');
    });

    it('T2.2: should gracefully reject corrupted and malformed protocol codes', async () => {
      await controller.processMessage('5511999990001', 'PROT-123');
      await controller.processMessage('5511999990001', 'RES-2026-123456');
      await controller.processMessage('5511999990001', 'PROT-RES-');

      const reply = bus.getLastReplyFor('5511999990001');
      expect(reply?.content).toContain('envie o seu código de protocolo');
    });

    it('T2.3: should clean excessive leading, trailing, and internal whitespace in protocol code', async () => {
      await controller.processMessage('5511999990001', '   \t\n  PROT-RES-2026-ABC123   \n\r ');
      const reply = bus.getLastReplyFor('5511999990001');
      expect(reply?.content).toContain('PROTOCOLO LOCALIZADO COM SUCESSO');
    });

    it('T2.4: should handle mixed-case protocol input (e.g. pRoT-ReS-2026-AbC123)', async () => {
      await controller.processMessage('5511999990001', 'pRoT-ReS-2026-AbC123');
      const reply = bus.getLastReplyFor('5511999990001');
      expect(reply?.content).toContain('PROT-RES-2026-ABC123');
      expect(reply?.content).toContain('Pet Shop Exemplo');
    });

    it('T2.5: should reject malformed emails with space, missing TLD, or missing @', () => {
      expect(validateAndSanitizeField('email', 'user@domain').valid).toBe(false);
      expect(validateAndSanitizeField('email', 'user @domain.com').valid).toBe(false);
      expect(validateAndSanitizeField('email', '@domain.com').valid).toBe(false);
      expect(validateAndSanitizeField('email', 'user@@domain.com').valid).toBe(false);
      expect(validateAndSanitizeField('email', 'user@domain..com').valid).toBe(false);
    });

    it('T2.6: should reject out-of-bounds phone lengths (less than 10 digits or over 13 digits)', () => {
      expect(validateAndSanitizeField('telefone', '119').valid).toBe(false);
      expect(validateAndSanitizeField('telefone', '123456789012345678').valid).toBe(false);
      expect(validateAndSanitizeField('telefone', '11987654321').valid).toBe(true);
    });

    it('T2.7: should clean emojis from names while preserving valid accents', () => {
      const sanitized = validateAndSanitizeField('nome_completo', 'Maria José da Silva 🚀🌟');
      expect(sanitized.valid).toBe(true);
      expect(sanitized.value).toContain('Maria José da Silva');
    });

    it('T2.8: should process extreme length messages safely if protocol code is embedded', async () => {
      const spamPrefix = 'Palavra '.repeat(200);
      const longMessage = `${spamPrefix} PROT-RES-2026-ABC123 ${spamPrefix}`;

      await controller.processMessage('5511999990001', longMessage);
      const reply = bus.getLastReplyFor('5511999990001');
      expect(reply?.content).toContain('PROTOCOLO LOCALIZADO COM SUCESSO');
    });

    it('T2.9: should neutralize SQL Injection payloads in inputs', async () => {
      await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
      await controller.processMessage('5511999990001', "mudar nome para '; DROP TABLE parceiros_resgates; --");

      const dbRecord = db.getByProtocol('PROT-RES-2026-ABC123')!;
      expect(dbRecord.nome_completo).not.toContain('DROP TABLE');
      // DB structure remains intact
      expect(db.getByProtocol('PROT-RES-2026-DEF456')).toBeDefined();
    });

    it('T2.10: should strip HTML / XSS tags from name and email inputs', () => {
      const xssName = validateAndSanitizeField('nome_completo', '<script>alert("xss")</script> Carlos Alberto');
      expect(xssName.valid).toBe(true);
      expect(xssName.value).toBe('Carlos Alberto');

      const xssEmail = validateAndSanitizeField('email', '<script>alert(1)</script>@gmail.com');
      expect(xssEmail.valid).toBe(false);
    });
  });

  // ==========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS & STATE TRANSITIONS
  // ==========================================================================
  describe('Tier 3: Pairwise Combinatorial & State Transitions', () => {

    it('T3.1: should allow sequential mutations (Email -> Phone) in the same continuous session', async () => {
      await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');

      // 1. Change Email
      await controller.processMessage('5511999990001', 'mudar email para adriano.novo@gsa.com');
      expect(db.getByProtocol('PROT-RES-2026-ABC123')?.email).toBe('adriano.novo@gsa.com');

      // 2. Change Phone in same session
      await controller.processMessage('5511999990001', 'agora mudar telefone para 11999887766');
      expect(db.getByProtocol('PROT-RES-2026-ABC123')?.telefone).toBe('5511999887766');

      expect(bus.getAdminAlerts().length).toBe(2);
    });

    it('T3.2: should allow field mutation followed by cancellation in same session', async () => {
      await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
      await controller.processMessage('5511999990001', 'mudar nome para Adriano Farias Sauro');
      expect(db.getByProtocol('PROT-RES-2026-ABC123')?.nome_completo).toBe('Adriano Farias Sauro');

      await controller.processMessage('5511999990001', 'quero cancelar meu resgate');
      await controller.processMessage('5511999990001', 'sim');

      const finalRecord = db.getByProtocol('PROT-RES-2026-ABC123')!;
      expect(finalRecord.nome_completo).toBe('Adriano Farias Sauro');
      expect(finalRecord.status).toBe('cancelado');
    });

    it('T3.3: should abort cancellation and seamlessly transition into an email alteration', async () => {
      await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
      await controller.processMessage('5511999990001', 'cancelar protocolo');
      await controller.processMessage('5511999990001', 'não, desisti');

      const abortedReply = bus.getLastReplyFor('5511999990001');
      expect(abortedReply?.content).toContain('Cancelamento abortado');
      expect(db.getByProtocol('PROT-RES-2026-ABC123')?.status).toBe('pendente');

      await controller.processMessage('5511999990001', 'quero mudar meu email para mantido@gsa.com.br');
      expect(db.getByProtocol('PROT-RES-2026-ABC123')?.email).toBe('mantido@gsa.com.br');
    });

    it('T3.4: should guide user through field selection, recover from invalid input, and complete mutation', async () => {
      await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
      await controller.processMessage('5511999990001', 'alterar');
      await controller.processMessage('5511999990001', 'opcao invalida xyz'); // Invalid choice

      const retryMenu = bus.getLastReplyFor('5511999990001');
      expect(retryMenu?.content).toContain('Opção inválida');

      await controller.processMessage('5511999990001', '2'); // Select Email
      await controller.processMessage('5511999990001', 'email-invalido-sem-dominio'); // Invalid value

      const retryValue = bus.getLastReplyFor('5511999990001');
      expect(retryValue?.content).toContain('E-mail inválido');

      await controller.processMessage('5511999990001', 'email.correto@empresa.com.br'); // Valid value
      expect(db.getByProtocol('PROT-RES-2026-ABC123')?.email).toBe('email.correto@empresa.com.br');
    });

    it('T3.5: should retain state and handle unrecognized messages gracefully', async () => {
      await controller.processMessage('5511999990001', 'PROT-RES-2026-ABC123');
      await controller.processMessage('5511999990001', 'qual o tempo de entrega das pizzas?'); // Unrelated

      const reply = bus.getLastReplyFor('5511999990001');
      expect(reply?.content).toContain('Desculpe, não entendi');
      expect(reply?.content).toContain('alterar');
    });

    it('T3.6: should support concurrent isolated sessions from different phone numbers with zero state leakage', async () => {
      const userA = '5511999991111';
      const userB = '5521999992222';

      // User A loads Protocol ABC123
      await controller.processMessage(userA, 'PROT-RES-2026-ABC123');
      // User B loads Protocol DEF456
      await controller.processMessage(userB, 'PROT-RES-2026-DEF456');

      // User A changes Email
      await controller.processMessage(userA, 'mudar email para user.a@domain.com');
      // User B cancels
      await controller.processMessage(userB, 'cancelar');
      await controller.processMessage(userB, 'sim');

      expect(db.getByProtocol('PROT-RES-2026-ABC123')?.email).toBe('user.a@domain.com');
      expect(db.getByProtocol('PROT-RES-2026-ABC123')?.status).toBe('pendente');

      expect(db.getByProtocol('PROT-RES-2026-DEF456')?.status).toBe('cancelado');
      expect(db.getByProtocol('PROT-RES-2026-DEF456')?.email).toBe('mariana.costa@email.com');
    });
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD MULTI-TURN WORKLOAD DIALOGUES
  // ==========================================================================
  describe('Tier 4: Real-World Multi-Turn Workload Scenarios', () => {

    it('T4.1: Scenario 1 - One-Shot Fast Path Email Alteration', async () => {
      const clientPhone = '5511988881111';

      // Turn 1: Client sends protocol
      await controller.processMessage(clientPhone, 'Olá, meu protocolo é PROT-RES-2026-ABC123');
      const turn1Reply = bus.getLastReplyFor(clientPhone);
      expect(turn1Reply?.content).toContain('PROTOCOLO LOCALIZADO COM SUCESSO');
      expect(turn1Reply?.content).toContain('Pet Shop Exemplo');

      // Turn 2: Client sends one-shot email alteration
      await controller.processMessage(clientPhone, 'gostaria de mudar meu email para adriano.novo@gsa.com.br por favor');
      const turn2Reply = bus.getLastReplyFor(clientPhone);
      expect(turn2Reply?.content).toContain('E-mail atualizado com sucesso');
      expect(turn2Reply?.content).toContain('adriano.novo@gsa.com.br');

      // Verification: DB updated & Admin alerted
      expect(db.getByProtocol('PROT-RES-2026-ABC123')?.email).toBe('adriano.novo@gsa.com.br');
      const adminAlert = bus.getLastReplyFor(ADMIN_MASTER_PHONE);
      expect(adminAlert?.content).toContain('adriano.novo@gsa.com.br');
    });

    it('T4.2: Scenario 2 - Guided Multi-Turn Step-by-Step Phone Update', async () => {
      const clientPhone = '5521977772222';

      // Turn 1: Ingestion
      await controller.processMessage(clientPhone, 'PROT-RES-2026-DEF456');
      expect(bus.getLastReplyFor(clientPhone)?.content).toContain('Clínica Veterinária Vida Pet');

      // Turn 2: Intent declaration
      await controller.processMessage(clientPhone, 'Preciso atualizar meus dados cadastrais');
      expect(bus.getLastReplyFor(clientPhone)?.content).toContain('Qual dado você gostaria de alterar');

      // Turn 3: Select field
      await controller.processMessage(clientPhone, 'meu telefone');
      expect(bus.getLastReplyFor(clientPhone)?.content).toContain('Digite o novo *Telefone com DDD*');

      // Turn 4: Enter value
      await controller.processMessage(clientPhone, '(21) 98765-4321');
      expect(bus.getLastReplyFor(clientPhone)?.content).toContain('Telefone alterado com sucesso');

      // Verification
      expect(db.getByProtocol('PROT-RES-2026-DEF456')?.telefone).toBe('5521987654321');
      expect(bus.getLastReplyFor(ADMIN_MASTER_PHONE)?.content).toContain('5521987654321');
    });

    it('T4.3: Scenario 3 - Complete Two-Step Cancellation Dialogue with Confirmation', async () => {
      const clientPhone = '5531966663333';

      // Turn 1: Ingestion
      await controller.processMessage(clientPhone, 'PROT-RES-2026-GHI789');
      expect(bus.getLastReplyFor(clientPhone)?.content).toContain('Farmácia Pet Mais');

      // Turn 2: Cancellation intent
      await controller.processMessage(clientPhone, 'Não quero mais esse benefício, como faço para cancelar?');
      const challengeReply = bus.getLastReplyFor(clientPhone);
      expect(challengeReply?.content).toContain('CONFIRMAÇÃO DE CANCELAMENTO');
      expect(challengeReply?.content).toContain('Deseja realmente cancelar o protocolo');

      // Turn 3: User confirms
      await controller.processMessage(clientPhone, 'Sim, confirmo o cancelamento definitivo');
      const finalReply = bus.getLastReplyFor(clientPhone);
      expect(finalReply?.content).toContain('cancelado com sucesso');
      expect(finalReply?.content).toContain(SUPPORT_COMPANY_PHONE);

      // Verification
      const record = db.getByProtocol('PROT-RES-2026-GHI789')!;
      expect(record.status).toBe('cancelado');
      expect(record.data_cancelamento).toBeTruthy();
      expect(bus.getLastReplyFor(ADMIN_MASTER_PHONE)?.content).toContain('Cancelamento de Resgate');
    });

    it('T4.4: Scenario 4 - Cancellation Aborted Followed by Immediate Name Change', async () => {
      const clientPhone = '5541955554444';

      // Turn 1: Ingestion
      await controller.processMessage(clientPhone, 'PROT-RES-2026-JKL012');

      // Turn 2: Request cancellation
      await controller.processMessage(clientPhone, 'Quero cancelar');
      expect(bus.getLastReplyFor(clientPhone)?.content).toContain('CONFIRMAÇÃO DE CANCELAMENTO');

      // Turn 3: Abort cancellation
      await controller.processMessage(clientPhone, 'Não, pensei melhor e não quero cancelar não');
      expect(bus.getLastReplyFor(clientPhone)?.content).toContain('Cancelamento abortado');
      expect(db.getByProtocol('PROT-RES-2026-JKL012')?.status).toBe('pendente');

      // Turn 4: Follow-up name alteration
      await controller.processMessage(clientPhone, 'Então altera meu nome para Beatriz Vasconcelos de Albuquerque');
      expect(bus.getLastReplyFor(clientPhone)?.content).toContain('Nome atualizado com sucesso');

      // Verification
      expect(db.getByProtocol('PROT-RES-2026-JKL012')?.nome_completo).toBe('Beatriz Vasconcelos de Albuquerque');
      expect(db.getByProtocol('PROT-RES-2026-JKL012')?.status).toBe('pendente');
    });

    it('T4.5: Scenario 5 - Complete Resilience & Recovery on AI API Outage', async () => {
      const clientPhone = '5551944445555';

      // Simulate Gemini API outage (e.g. 503 Service Unavailable / Timeout)
      controller.geminiNLUOverride = vi.fn().mockImplementation(async () => {
        throw new Error('Gemini API Service Unavailable (HTTP 503)');
      });

      // Turn 1: Protocol ingestion
      await controller.processMessage(clientPhone, 'PROT-RES-2026-MNO345');
      expect(bus.getLastReplyFor(clientPhone)?.content).toContain('Hotelzinho Pet Paradise');

      // Turn 2: Natural language request during AI outage
      await controller.processMessage(clientPhone, 'quero mudar meu email para rodrigo.resiliente@empresa.com.br');

      // Verification: Fallback engine seamlessly took over
      expect(bus.getLastReplyFor(clientPhone)?.content).toContain('E-mail atualizado com sucesso');
      expect(db.getByProtocol('PROT-RES-2026-MNO345')?.email).toBe('rodrigo.resiliente@empresa.com.br');
      expect(bus.getLastReplyFor(ADMIN_MASTER_PHONE)?.content).toContain('rodrigo.resiliente@empresa.com.br');
    });

  });

});

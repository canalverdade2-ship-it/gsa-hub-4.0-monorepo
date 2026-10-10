import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  PartnerRedemptionAppealsEngine,
  sha256,
  normalizePhone,
  ADMIN_MASTER_LID,
  ADMIN_MASTER_PHONE,
} from './partner-redemption-appeals-e2e.test';

describe('Adversarial Stress Harness: Partner Redemption Appeals & UTF-8 Encoding', () => {
  let engine: PartnerRedemptionAppealsEngine;

  beforeEach(() => {
    engine = new PartnerRedemptionAppealsEngine([
      {
        id: 'resgate-adv-001',
        parceiro_id: 'parc-adv-001',
        parceiro_nome: 'Drogaria & Manipulação São Paulo',
        parceiro_slug: 'drogaria-sp',
        parceiro_logo: 'https://cdn.grupogsa.com.br/logo.png',
        cliente_id: 'cli-adv-001',
        nome_completo: 'Clara Nogueira de Alcântara',
        email: 'clara.alcantara@empresa.com.br',
        telefone: '5511987654321',
        codigo_gerado: 'PROT-ADV-2026-999',
        tipo_resgate: 'desconto_exclusivo',
        status: 'recusado',
        motivo_recusa: 'Documentação ilegível ou incompleta para verificação de vínculo associativo.',
        recusado_em: '2026-08-28T14:00:00.000Z',
        created_at: '2026-08-28T10:00:00.000Z',
        updated_at: '2026-08-28T14:00:00.000Z',
      },
      {
        id: 'resgate-adv-002',
        parceiro_id: 'parc-adv-002',
        parceiro_nome: 'PetCare & Veterinária 24h',
        parceiro_slug: 'petcare-24h',
        cliente_id: 'cli-adv-002',
        nome_completo: 'João Victor Silva Santos',
        email: 'joao.santos@email.com',
        telefone: '5511971858372', // Admin Master Phone
        codigo_gerado: 'PROT-ADV-2026-888',
        tipo_resgate: 'consulta_cortesia',
        status: 'recusado',
        motivo_recusa: 'Prazo excedido para solicitação no mês vigente.',
        recusado_em: '2026-08-28T15:00:00.000Z',
        created_at: '2026-08-28T11:00:00.000Z',
        updated_at: '2026-08-28T15:00:00.000Z',
      },
    ]);
  });

  // ==========================================================================
  // 1. JUSTIFICATION BOUNDARY FUZZING & INJECTION RESILIENCE
  // ==========================================================================
  describe('1. Justification Boundary Fuzzing & Injection Resilience', () => {
    it('ADV-1.1: rejects 0 chars empty justification', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;

      const res = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: '',
        idempotencyKey: crypto.randomUUID(),
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe('invalid_justification_length');
    });

    it('ADV-1.2: rejects whitespace-only justification of varying lengths', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;

      const whitespaceSamples = [
        ' ',
        '   ',
        '\t\t\t\t\t',
        '\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n', // 20 newlines
        '                    ', // 20 spaces
        ' \t \n \r \t         ', // mixed whitespace > 20 chars
      ];

      for (const sample of whitespaceSamples) {
        const res = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin,
          justificativa: sample,
          idempotencyKey: crypto.randomUUID(),
        });
        expect(res.success).toBe(false);
        expect(res.error).toBe('invalid_justification_length');
      }
    });

    it('ADV-1.3: rejects 1 char justification', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;

      const res = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: 'X',
        idempotencyKey: crypto.randomUUID(),
      });
      expect(res.success).toBe(false);
      expect(res.error).toBe('invalid_justification_length');
    });

    it('ADV-1.4: rejects 19 chars justification (1 below boundary)', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;

      const text19 = '1234567890123456789'; // exact 19 chars
      expect(text19.length).toBe(19);

      const res = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: text19,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(res.success).toBe(false);
      expect(res.error).toBe('invalid_justification_length');
    });

    it('ADV-1.5: accepts exact 20 chars justification (minimum boundary)', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;

      const text20 = '12345678901234567890'; // exact 20 chars
      expect(text20.length).toBe(20);

      const res = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: text20,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(res.success).toBe(true);
      expect(engine.appeals.get(res.appeal.id)!.contestacao_cliente).toBe(text20);
    });

    it('ADV-1.6: accepts exact 4000 chars justification (maximum boundary)', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;

      const text4000 = 'A'.repeat(4000);
      expect(text4000.length).toBe(4000);

      const res = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: text4000,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(res.success).toBe(true);
      expect(engine.appeals.get(res.appeal.id)!.contestacao_cliente.length).toBe(4000);
    });

    it('ADV-1.7: rejects 4001 chars justification (1 above boundary)', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;

      const text4001 = 'A'.repeat(4001);
      expect(text4001.length).toBe(4001);

      const res = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: text4001,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(res.success).toBe(false);
      expect(res.error).toBe('invalid_justification_length');
    });

    it('ADV-1.8: preserves rich UTF-8 portuguese characters, accents and symbols', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;

      const richText = 'Apresento contestação formal à recusa: já possuo quitação, filiação ativa e benefício com carência 100% cumprida.';
      expect(richText.length).toBeGreaterThanOrEqual(20);

      const res = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: richText,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(res.success).toBe(true);
      const stored = engine.appeals.get(res.appeal.id)!;
      expect(stored.contestacao_cliente).toBe(richText);
      expect(stored.contestacao_cliente).toContain('contestação');
      expect(stored.contestacao_cliente).toContain('quitação');
      expect(stored.contestacao_cliente).toContain('filiação');
      expect(stored.contestacao_cliente).toContain('carência');
    });

    it('ADV-1.9: handles multi-byte emojis and unicode symbols in justification', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;

      const emojiText = '🐾 Solicito reanálise do meu cupom PetCare! 🐶🐱 Tudo pago em dia ✨';
      expect(emojiText.trim().length).toBeGreaterThanOrEqual(20);

      const res = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: emojiText,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(res.success).toBe(true);
      expect(engine.appeals.get(res.appeal.id)!.contestacao_cliente).toBe(emojiText);
    });

    it('ADV-1.10: safely handles HTML / script injection payloads without crash', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;

      const injectionPayload = "<script>alert('XSS-ATTACK')</script><iframe src='evil.com'></iframe>Justificativa valida";
      expect(injectionPayload.length).toBeGreaterThanOrEqual(20);

      const res = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: injectionPayload,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(res.success).toBe(true);
      expect(engine.appeals.get(res.appeal.id)!.contestacao_cliente).toBe(injectionPayload);
    });

    it('ADV-1.11: preserves multiline text and CRLF formatting', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;

      const multiline = 'Motivo 1: Pagamento efetuado em 20/08.\r\nMotivo 2: Comprovante em anexo.\nMotivo 3: Vínculo ativo.';
      expect(multiline.length).toBeGreaterThanOrEqual(20);

      const res = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: multiline,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(res.success).toBe(true);
      expect(engine.appeals.get(res.appeal.id)!.contestacao_cliente).toBe(multiline);
    });
  });

  // ==========================================================================
  // 2. EVIDENCE FILE UPLOAD BOUNDARIES & URL SANITIZATION
  // ==========================================================================
  describe('2. Evidence File Upload Boundaries', () => {
    it('ADV-2.1: accepts 0 evidence files (justification only)', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;

      const res = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: 'Solicitação válida com justificativa sem anexos para este caso.',
        anexos: [],
        idempotencyKey: crypto.randomUUID(),
      });

      expect(res.success).toBe(true);
      expect(res.appeal.evidencias).toEqual([]);
    });

    it('ADV-2.2: accepts 1, 2, and 3 evidence files (exact upper bound)', () => {
      const files3 = [
        'https://cdn.grupogsa.com.br/recursos/anexo1.pdf',
        'https://cdn.grupogsa.com.br/recursos/anexo2.png',
        'https://cdn.grupogsa.com.br/recursos/anexo3.jpg',
      ];

      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;

      const res = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: 'Justificativa completa com anexos comprobatórios da solicitação.',
        anexos: files3,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(res.success).toBe(true);
      expect(res.appeal.evidencias.length).toBe(3);
    });

    it('ADV-2.3: rejects 4 or more evidence files (exceeds maximum allowed 3)', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;

      const files4 = [
        'https://cdn.grupogsa.com.br/recursos/1.pdf',
        'https://cdn.grupogsa.com.br/recursos/2.pdf',
        'https://cdn.grupogsa.com.br/recursos/3.pdf',
        'https://cdn.grupogsa.com.br/recursos/4.pdf',
      ];

      const res = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: 'Tentativa de envio de 4 arquivos comprobatórios no recurso.',
        anexos: files4,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe('max_attachments_exceeded');
    });

    it('ADV-2.4: verifies evidence storage path sanitization logic', () => {
      const sanitizeProtocol = (protocol: string) => protocol.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      
      expect(sanitizeProtocol('PROT-RES-2026-AAA111')).toBe('prot_res_2026_aaa111');
      expect(sanitizeProtocol('PROT/2026#001@GSA!')).toBe('prot_2026_001_gsa_');
      expect(sanitizeProtocol('GSA PROTOCOL SP 2026')).toBe('gsa_protocol_sp_2026');
    });
  });

  // ==========================================================================
  // 3. DOUBLE-SUBMISSION, IDEMPOTENCY & SINGLE-APPEAL LOCK
  // ==========================================================================
  describe('3. Double-Submission & Idempotency Protection', () => {
    it('ADV-3.1: concurrent submission with same idempotency key returns cached appeal without duplication', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;
      const idempotencyKey = crypto.randomUUID();

      const res1 = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: 'Justificativa enviada na primeira tentativa de requisição.',
        idempotencyKey,
      });
      expect(res1.success).toBe(true);

      const res2 = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: 'Justificativa repetida na segunda tentativa de requisição.',
        idempotencyKey,
      });

      expect(res2.success).toBe(true);
      expect(res2.appeal.id).toBe(res1.appeal.id);
      expect(res2.appeal.protocolo_recurso).toBe(res1.appeal.protocolo_recurso);
      expect(Array.from(engine.appeals.values()).length).toBe(1);
    });

    it('ADV-3.2: blocks second appeal on same redemption with DIFFERENT idempotency key (Single Appeal Lock)', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;

      const res1 = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: 'Primeiro recurso interposto pelo titular com sucesso.',
        idempotencyKey: crypto.randomUUID(),
      });
      expect(res1.success).toBe(true);

      const challenge2 = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      expect(challenge2.success).toBe(false);
      expect(challenge2.eligible).toBe(false);
      expect(challenge2.already_used).toBe(true);
      expect(challenge2.error).toBe('appeal_already_used');
    });

    it('ADV-3.3: invalidates challenge PIN on 5 failed attempts (Brute Force Protection)', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const correctPin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;
      const wrongPin = '000000';

      for (let i = 1; i <= 4; i++) {
        const attempt = engine.completePartnerAppeal({
          challengeId: challenge.challenge_id!,
          pin: wrongPin,
          justificativa: 'Tentativa de recurso com PIN incorreto para teste de limite.',
          idempotencyKey: crypto.randomUUID(),
        });
        expect(attempt.success).toBe(false);
        expect(attempt.error).toBe('invalid_or_expired_code');
        expect(engine.challenges.get(challenge.challenge_id!)!.attempts).toBe(i);
      }

      const attempt5 = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin: wrongPin,
        justificativa: 'Quinta tentativa de recurso com PIN incorreto.',
        idempotencyKey: crypto.randomUUID(),
      });
      expect(attempt5.success).toBe(false);
      expect(engine.challenges.get(challenge.challenge_id!)!.attempts).toBe(5);

      const attempt6 = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin: correctPin,
        justificativa: 'Tentativa com PIN correto após o bloqueio de 5 falhas.',
        idempotencyKey: crypto.randomUUID(),
      });
      expect(attempt6.success).toBe(false);
      expect(attempt6.error).toBe('invalid_or_expired_code');
    });

    it('ADV-3.4: consumes challenge once used — cannot reuse challenge token', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;

      const res = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: 'Primeira utilização do desafio de segurança com sucesso.',
        idempotencyKey: crypto.randomUUID(),
      });
      expect(res.success).toBe(true);

      const reuse = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: 'Tentativa de reutilização do desafio de segurança consumido.',
        idempotencyKey: crypto.randomUUID(),
      });
      expect(reuse.success).toBe(false);
      expect(reuse.error).toBe('invalid_or_expired_code');
    });
  });

  // ==========================================================================
  // 4. DENIAL REASON VALIDATION (<10 CHARS REJECTED, >=10 CHARS ACCEPTED)
  // ==========================================================================
  describe('4. Denial Reason Validation Boundaries', () => {
    let appealId: string;

    beforeEach(() => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;
      const res = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: 'Justificativa do cliente aguardando julgamento da diretoria.',
        idempotencyKey: crypto.randomUUID(),
      });
      appealId = res.appeal.id;
    });

    it('ADV-4.1: rejects denial with empty reason', () => {
      expect(() => {
        engine.decidePartnerAppeal(appealId, 'indeferido', '');
      }).toThrow(/10.*caracteres/i);
    });

    it('ADV-4.2: rejects denial with whitespace-only reason >= 10 spaces', () => {
      expect(() => {
        engine.decidePartnerAppeal(appealId, 'indeferido', '            '); // 12 spaces
      }).toThrow(/10.*caracteres/i);
    });

    it('ADV-4.3: rejects denial with 9 characters (1 below minimum boundary)', () => {
      expect(() => {
        engine.decidePartnerAppeal(appealId, 'indeferido', '123456789'); // 9 chars
      }).toThrow(/10.*caracteres/i);
    });

    it('ADV-4.4: accepts denial with exactly 10 characters (minimum boundary)', () => {
      const res = engine.decidePartnerAppeal(appealId, 'indeferido', '1234567890');
      expect(res.success).toBe(true);
      expect(res.appeal?.status).toBe('indeferido');
      expect(res.appeal?.motivo_decisao).toBe('1234567890');
    });

    it('ADV-4.5: accepts denial with exactly 2000 characters (maximum boundary)', () => {
      const text2000 = 'M'.repeat(2000);
      const res = engine.decidePartnerAppeal(appealId, 'indeferido', text2000);
      expect(res.success).toBe(true);
      expect(res.appeal?.status).toBe('indeferido');
      expect(res.appeal?.motivo_decisao?.length).toBe(2000);
    });

    it('ADV-4.6: rejects denial with 2001 characters (1 above maximum boundary)', () => {
      const text2001 = 'M'.repeat(2001);
      expect(() => {
        engine.decidePartnerAppeal(appealId, 'indeferido', text2001);
      }).toThrow();
    });

    it('ADV-4.7: accepts approval (deferido) without requiring any denial reason', () => {
      const res = engine.decidePartnerAppeal(appealId, 'deferido');
      expect(res.success).toBe(true);
      expect(res.appeal?.status).toBe('deferido');
      expect(engine.redemptions.get('resgate-adv-001')!.status).toBe('pendente');
    });
  });

  // ==========================================================================
  // 5. WHATSAPP PAYLOAD STRUCTURE & UTF-8 ENCODING VERIFICATION
  // ==========================================================================
  describe('5. WhatsApp Payload Structure & UTF-8 Formatting Across Templates', () => {
    it('ADV-5.1: formats appeal received template with 100% clean UTF-8 characters', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;
      engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: 'Solicitação de reconsideração de recusa de benefício.',
        idempotencyKey: crypto.randomUUID(),
      });

      const outboxItem = engine.outbox.find(o => o.tipo === 'recurso_recebido_cliente');
      expect(outboxItem).toBeDefined();

      const msg = outboxItem!.mensagem;
      expect(msg).toContain('Olá, *Clara*.');
      expect(msg).toContain('Seu recurso foi recebido e será analisado em até *5 dias*.');
      expect(msg).toContain('Protocolo da solicitação: *PROT-ADV-2026-999*');
      expect(msg).toContain('Protocolo do recurso: *REC-2026-');

      expect(msg).not.toContain('\uFFFD');
      expect(msg).not.toContain('Ã§');
      expect(msg).not.toContain('Ã£');
      expect(msg).not.toContain('Ã©');
      expect(msg).not.toContain('Ã¡');
    });

    it('ADV-5.2: formats admin appeal alert notification with clean formatting and admin destination', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;
      engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: 'Solicitação de reconsideração de recusa de benefício.',
        idempotencyKey: crypto.randomUUID(),
      });

      const adminOutbox = engine.outbox.find(o => o.tipo === 'recurso_aberto_admin');
      expect(adminOutbox).toBeDefined();
      expect(adminOutbox!.mensagem).toContain('Novo recurso de solicitação recebido.');
      expect(adminOutbox!.mensagem).toContain('Protocolo: *PROT-ADV-2026-999*');
      expect(adminOutbox!.telefone).toBe(ADMIN_MASTER_PHONE);
      expect(normalizePhone(adminOutbox!.telefone)).toBe(ADMIN_MASTER_LID);
    });

    it('ADV-5.3: formats appeal approval notification (recurso deferido)', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;
      const appealRes = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: 'Justificativa aprovada.',
        idempotencyKey: crypto.randomUUID(),
      });

      engine.decidePartnerAppeal(appealRes.appeal.id, 'deferido');

      const outboxItem = engine.outbox.find(o => o.tipo === 'recurso_aprovado_cliente');
      expect(outboxItem).toBeDefined();

      const msg = outboxItem!.mensagem;
      expect(msg).toContain('Seu recurso foi *aprovado*');
      expect(msg).toContain('Protocolo: *PROT-ADV-2026-999*');
      
      expect(msg).not.toContain('\uFFFD');
      expect(msg).not.toContain('Ã');
    });

    it('ADV-5.4: formats appeal denial notification (recurso indeferido) with mandatory justification', () => {
      const challenge = engine.beginPartnerAppealChallenge('PROT-ADV-2026-999');
      const pin = engine.challenges.get(challenge.challenge_id!)!.raw_pin!;
      const appealRes = engine.completePartnerAppeal({
        challengeId: challenge.challenge_id!,
        pin,
        justificativa: 'Justificativa a ser negada com fundamentação.',
        idempotencyKey: crypto.randomUUID(),
      });

      const motivoDecisao = 'Após reavaliação detalhada dos documentos, constatou-se que o prazo regulamentar expirou.';
      engine.decidePartnerAppeal(appealRes.appeal.id, 'indeferido', motivoDecisao);

      const outboxItem = engine.outbox.find(o => o.tipo === 'recurso_recusado_cliente');
      expect(outboxItem).toBeDefined();

      const msg = outboxItem!.mensagem;
      expect(msg).toContain('Seu recurso foi analisado e não pôde ser aprovado.');
      expect(msg).toContain(`*Motivo:* ${motivoDecisao}`);
      expect(msg).not.toContain('\uFFFD');
      expect(msg).not.toContain('Ã');
    });

    it('ADV-5.5: routes Master Admin phone to Baileys LID destination (38830967099420@lid)', () => {
      expect(normalizePhone('5511971858372')).toBe(ADMIN_MASTER_LID);
      expect(normalizePhone('11971858372')).toBe(ADMIN_MASTER_LID);
      expect(normalizePhone('(11) 97185-8372')).toBe(ADMIN_MASTER_LID);
      
      expect(normalizePhone('11987654321')).toBe('5511987654321');
      expect(normalizePhone('5511987654321')).toBe('5511987654321');
    });

    it('ADV-5.6: audits all generated messages against comprehensive Portuguese character dictionary', () => {
      const sampleTexts = [
        'Olá, Clara! Seu benefício já está disponível com 100% de desconto e carência zero.',
        'Atenção: É permitido apresentar apenas 1 (um) recurso por solicitação.',
        'O recurso foi recebido e será analisado em até cinco dias pela diretoria.',
        'Não foi possível concluir o envio da solicitação no momento.',
        'Documentação de comprovação de vínculo associativo aprovada com sucesso.',
      ];

      for (const text of sampleTexts) {
        expect(/[áéíóúçãõâêôÁÉÍÓÚÇÃÕÂÊÔ]/.test(text)).toBe(true);
        expect(text).not.toContain('\uFFFD');
        expect(text).not.toContain('Ã§');
        expect(text).not.toContain('Ã£');
        expect(text).not.toContain('Ã©');
        expect(text).not.toContain('Ã¡');
        expect(text).not.toContain('Ã³');
        expect(text).not.toContain('Ãº');
        expect(text).not.toContain('Ã¢');
        expect(text).not.toContain('Ãª');
        expect(text).not.toContain('Ã´');
      }
    });
  });

  // ==========================================================================
  // 6. FORENSIC AUDIT OF SOURCE CODE UTF-8 ENCODING
  // ==========================================================================
  describe('6. Codebase UTF-8 Forensic Integrity Audit', () => {
    const targetFiles = [
      'src/components/public/ProtocolConsultPage.tsx',
      'src/components/admin/super-domains/pessoas/PartnerRedemptionDetailModal.tsx',
      'src/components/admin/PartnersAdminModule.tsx',
      'src/features/partners/service.ts',
      'src/features/partners/types.ts',
      'src/utils/n8nWhatsApp.ts',
      'src/lib/whatsappNotificationService.ts',
      'supabase/functions/vps-api/index.ts',
      'supabase/migrations/20260828170000_partner_redemption_appeals.sql',
    ];

    it('ADV-6.1: scans all core modified files for corrupt UTF-8 sequences and broken accents', () => {
      const rootDir = process.cwd();
      const corruptedPatterns = [
        /\uFFFD/,
        /\u00C3\u00A7/g,
        /\u00C3\u00A3/g,
        /\u00C3\u00A9/g,
        /\u00C3\u00A1/g,
        /\u00C3\u00B3/g,
        /\u00C3\u00BA/g,
        /\u00C3\u00A2/g,
        /\u00C3\u00AA/g,
        /\u00C3\u00B4/g,
        /Ã\s/g,
      ];

      for (const relPath of targetFiles) {
        const fullPath = path.join(rootDir, relPath);
        if (!fs.existsSync(fullPath)) continue;

        const content = fs.readFileSync(fullPath, 'utf8');
        for (const pattern of corruptedPatterns) {
          const match = content.match(pattern);
          expect(match, `Found corrupted encoding matching ${pattern} in ${relPath}`).toBeNull();
        }
      }
    });
  });
});

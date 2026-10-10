import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260828170000_partner_redemption_appeals.sql'),
  'utf8',
);
const partnerService = fs.readFileSync(
  path.join(root, 'src/features/partners/service.ts'),
  'utf8',
);
const partnerTypes = fs.readFileSync(
  path.join(root, 'src/features/partners/types.ts'),
  'utf8',
);
const adminModal = fs.readFileSync(
  path.join(root, 'src/components/admin/super-domains/pessoas/PartnerRedemptionDetailModal.tsx'),
  'utf8',
);
const whatsappService = fs.readFileSync(
  path.join(root, 'src/lib/whatsappNotificationService.ts'),
  'utf8',
);

describe('Partner Redemption Appeals - Schema & Contract Verification', () => {
  it('enforces exactly one appeal per redemption in the database schema', () => {
    expect(migration).toMatch(/UNIQUE\s*\(resgate_id\)/i);
  });

  it('calculates the 5-day analysis deadline in the database', () => {
    expect(migration).toContain("now() + interval '5 days'");
  });

  it('keeps decisions atomic and locks both appeal and redemption with FOR UPDATE', () => {
    expect(migration.match(/FOR UPDATE/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration).toContain('gsa_admin_decide_partner_appeal');
  });

  it('uses an idempotency key for appeal submission', () => {
    expect(migration).toMatch(/idempotency_key uuid NOT NULL UNIQUE/i);
  });

  it('stores a permanent public timeline in parceiros_resgates_eventos', () => {
    expect(migration).toContain('parceiros_resgates_eventos');
    expect(migration).toContain('recurso_interposto');
    expect(migration).toContain('recurso_deferido');
    expect(migration).toContain('recurso_indeferido');
  });

  it('defines sanitized realtime tracking table without customer PII', () => {
    expect(migration).toContain('parceiros_resgates_public_status');
    expect(migration).toContain('tracking_key uuid NOT NULL UNIQUE');
  });

  it('requires challenge verification with expiration and attempt limits', () => {
    expect(migration).toContain("now() + interval '10 minutes'");
    expect(migration).toMatch(/attempts >= 5/);
    expect(migration).toContain('gsa_begin_partner_appeal_challenge');
    expect(migration).toContain('gsa_complete_partner_appeal');
  });

  it('requires a reason between 10 and 2000 characters when an appeal is denied', () => {
    expect(migration).toMatch(/v_decisao = 'indeferido'.*char_length/s);
    expect(migration).toContain('motivo_decisao');
  });

  it('returns an approved appeal to the existing pending flow', () => {
    expect(migration).toMatch(/IF v_decisao = 'deferido'.*SET status = 'pendente'/s);
  });

  it('defines TypeScript interface contracts for appeals and timeline events', () => {
    expect(partnerTypes).toContain('PartnerRedemptionAppeal');
    expect(partnerTypes).toContain('protocolo_recurso: string');
    expect(partnerTypes).toContain('PartnerRedemptionTimelineEvent');
    expect(partnerTypes).toContain('ProtocolConsultResult');
  });

  it('provides service functions for appeal challenge, submission, and admin decision', () => {
    expect(partnerService).toContain('requestPartnerAppealVerification');
    expect(partnerService).toContain('submitPartnerAppeal');
    expect(partnerService).toContain('decidePartnerAppeal');
    expect(partnerService).toContain('consultarProtocolo');
  });

  it('renders Evidence Gallery, Events Timeline, and decision workflow in PartnerRedemptionDetailModal', () => {
    const partnersAdmin = fs.readFileSync(
      path.join(root, 'src/components/admin/PartnersAdminModule.tsx'),
      'utf8',
    );

    // Evidence attachments gallery
    expect(adminModal).toContain('Evidências e Documentos Anexados');
    expect(adminModal).toContain('resgate.recurso.evidencias');
    expect(adminModal).toContain('setSelectedPreviewImage');
    expect(adminModal).toContain('Documento PDF');

    // Events history timeline
    expect(adminModal).toContain('Histórico de Auditoria & Eventos');
    expect(adminModal).toContain('timelineEvents');
    expect(adminModal).toContain('loadTimelineEvents');
    expect(adminModal).toContain('parceiros_resgates_eventos');

    // Appeal decisions workflow
    expect(adminModal).toContain('decidePartnerAppeal');
    expect(adminModal).toContain('deferido');
    expect(adminModal).toContain('indeferido');
    expect(adminModal).toContain('appealDecisionReason');

    // Strict UTF-8 in admin modal and partners admin module
    for (const content of [adminModal, partnersAdmin]) {
      expect(content).not.toContain('\uFFFD');
      expect(content).not.toMatch(/Ã[§£¡©ª³µ]|Â[°º]/);
    }
  });

  it('keeps UTF-8 Portuguese text and accents intact across migration, service, types, and admin components', () => {
    const partnersAdmin = fs.readFileSync(
      path.join(root, 'src/components/admin/PartnersAdminModule.tsx'),
      'utf8',
    );
    for (const content of [migration, partnerService, partnerTypes, whatsappService, adminModal, partnersAdmin]) {
      expect(content).not.toContain('\uFFFD');
      expect(content).not.toMatch(/Ã[§£¡©ª³µ]|Â[°º]/);
    }
    expect(migration).toContain('Solicitação registrada');
    expect(whatsappService).toContain('SOLICITAÇÃO');
    expect(adminModal).toContain('Histórico de Auditoria & Eventos');
    expect(partnersAdmin).toContain('Configuração de Resgate de Benefício');
  });
});

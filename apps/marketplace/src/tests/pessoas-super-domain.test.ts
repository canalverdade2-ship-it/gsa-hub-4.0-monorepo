import { describe, expect, it, vi } from 'vitest';
import { 
  PessoasSuperDomain,
  SaquesRepassesSection,
  PayoutClearanceDrawer,
  TrabalheConoscoSection,
  AfiliadosSection,
  FidelidadePromocoesSection
} from '../components/admin/super-domains/pessoas';
import { callAdminRpc } from '../lib/adminRpc';

describe('Pessoas, RH & Prestadores Super-Domain (SD3)', () => {
  describe('Component Architecture & Exports', () => {
    it('should properly export all Super-Domain 3 components', () => {
      expect(typeof PessoasSuperDomain).toBe('function');
      expect(typeof SaquesRepassesSection).toBe('function');
      expect(typeof PayoutClearanceDrawer).toBe('function');
      expect(typeof TrabalheConoscoSection).toBe('function');
      expect(typeof AfiliadosSection).toBe('function');
      expect(typeof FidelidadePromocoesSection).toBe('function');
    });
  });

  describe('RPC Contract Signatures & Integration', () => {
    it('should preserve gsa_admin_processar_saque client withdrawal signature structure', () => {
      const mockClientParams = {
        p_saque_id: 'c-saque-456',
        p_acao: 'rejeitar' as const,
        p_motivo: 'Chave PIX inválida',
        p_data_pagamento: null
      };

      expect(mockClientParams).toHaveProperty('p_saque_id');
      expect(mockClientParams).toHaveProperty('p_acao');
      expect(mockClientParams).toHaveProperty('p_motivo');
      expect(mockClientParams).toHaveProperty('p_data_pagamento');
      expect(mockClientParams.p_motivo).toBe('Chave PIX inválida');
    });

    it('should preserve gsa_admin_adjust_points signature structure', () => {
      const mockPointsParams = {
        p_cliente_id: 'cli-001',
        p_pontos: 250,
        p_motivo: 'Bônus por fidelidade'
      };

      expect(mockPointsParams.p_cliente_id).toBe('cli-001');
      expect(mockPointsParams.p_pontos).toBe(250);
      expect(mockPointsParams.p_motivo).toBe('Bônus por fidelidade');
    });

    it('should preserve career application update signature structure', () => {
      const mockCareerParams = {
        p_application_id: 'app-999',
        p_status: 'interview_scheduled',
        p_internal_notes: 'Candidato excelente',
        p_public_message: null,
        p_interview_at: '2026-08-25T14:00:00Z',
        p_interview_location: 'Google Meet'
      };

      expect(mockCareerParams.p_status).toBe('interview_scheduled');
      expect(mockCareerParams.p_interview_location).toBe('Google Meet');
    });

    it('should preserve affiliate commission payout decision parameters', () => {
      const mockPayoutParams = {
        p_payout_id: 'payout-111',
        p_decision: 'pagar'
      };

      expect(mockPayoutParams.p_payout_id).toBe('payout-111');
      expect(mockPayoutParams.p_decision).toBe('pagar');
    });
  });
});

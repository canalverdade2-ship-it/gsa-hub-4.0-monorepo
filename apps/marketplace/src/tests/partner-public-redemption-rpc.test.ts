import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hoisted mocks for Supabase client
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockAdminRpc = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args),
  },
  getSupabase: () => ({
    rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args),
  }),
}));

vi.mock('../lib/adminRpc', () => ({
  callAdminRpc: (...args: any[]) => mockAdminRpc(...args),
}));

const mockEnviarWhatsAppDireto = vi.fn();
const mockGerarMensagemWhatsApp = vi.fn();

vi.mock('../lib/whatsappNotificationService', () => ({
  whatsappNotificationService: {
    enviarWhatsAppDireto: (...args: any[]) => mockEnviarWhatsAppDireto(...args),
    gerarMensagemWhatsApp: (...args: any[]) => mockGerarMensagemWhatsApp(...args),
  },
  resolveWhatsAppDestination: vi.fn().mockImplementation(async (phone: string) => `55${phone.replace(/\D/g, '')}`),
}));

const mockSendAdminWhatsAppNotification = vi.fn();

vi.mock('../utils/n8nWhatsApp', () => ({
  sendAdminWhatsAppNotification: (...args: any[]) => mockSendAdminWhatsAppNotification(...args),
  getAdminWhatsAppConfig: vi.fn().mockResolvedValue({
    phone: '5511920857756',
    webhookUrl: 'http://147.15.43.141:5678/webhook/send-whatsapp',
  }),
}));

import {
  redeemPartnerBenefit,
  completePartnerRedemption,
  listPartnerRedemptions,
} from '../features/partners/service';

describe('Partner Public Redemption RPC & 24h SLA Test Suite (F4 / R3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnviarWhatsAppDireto.mockResolvedValue(true);
    mockGerarMensagemWhatsApp.mockReturnValue('Mensagem formatada');
    mockSendAdminWhatsAppNotification.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Public Partner Redemption Validation (Name + Email + WhatsApp)', () => {
    it('should invoke gsa_public_resgatar_beneficio_parceiro with trimmed payload parameters', async () => {
      const mockResult = {
        success: true,
        resgate_id: 'res-uuid-101',
        partner_name: 'Petlove Saúde',
        partner_slug: 'petlove',
        tipo_resgate: 'cupom',
        codigo_gerado: 'PROT-RES-2026-AB12CD',
        protocolo: 'PROT-RES-2026-AB12CD',
        has_coupon: true,
        has_voucher: false,
        has_link: false,
        delay_24h: false,
      };

      mockRpc.mockResolvedValue({ data: mockResult, error: null });

      const updateEqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
      mockFrom.mockReturnValue({ update: updateMock });

      const response = await redeemPartnerBenefit({
        parceiroSlug: 'petlove',
        nomeCompleto: '  Adriano Farias  ',
        telefone: ' (11) 98765-4321 ',
        email: '  adriano@grupogsa.com.br  ',
      });

      expect(mockRpc).toHaveBeenCalledWith('gsa_public_resgatar_beneficio_parceiro', {
        p_parceiro_id: null,
        p_parceiro_slug: 'petlove',
        p_nome_completo: 'Adriano Farias',
        p_telefone: '(11) 98765-4321',
        p_cliente_id: null,
        p_email: 'adriano@grupogsa.com.br',
      });

      expect(response.success).toBe(true);
      expect(response.partner_name).toBe('Petlove Saúde');
      expect(response.codigo_gerado).toBe('PROT-RES-2026-AB12CD');
    });

    it('should handle legacy 5-parameter RPC signature fallback when p_email causes parameter error', async () => {
      const mockResult = {
        success: true,
        resgate_id: 'res-uuid-102',
        partner_name: 'Óticas Carol',
        codigo_gerado: 'PROT-RES-2026-EE55FF',
        protocolo: 'PROT-RES-2026-EE55FF',
        has_coupon: true,
        delay_24h: false,
      };

      // 1st call fails with parameter signature mismatch, 2nd call succeeds without p_email
      mockRpc
        .mockResolvedValueOnce({
          data: null,
          error: { message: 'function gsa_public_resgatar_beneficio_parceiro with p_email not found', code: 'PGRST202' },
        })
        .mockResolvedValueOnce({
          data: mockResult,
          error: null,
        });

      const updateEqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
      mockFrom.mockReturnValue({ update: updateMock });

      const response = await redeemPartnerBenefit({
        parceiroSlug: 'oticas-carol',
        nomeCompleto: 'Maria Oliveira',
        telefone: '11999998888',
        email: 'maria@email.com',
      });

      expect(mockRpc).toHaveBeenCalledTimes(2);
      expect(mockRpc).toHaveBeenLastCalledWith('gsa_public_resgatar_beneficio_parceiro', {
        p_parceiro_id: null,
        p_parceiro_slug: 'oticas-carol',
        p_nome_completo: 'Maria Oliveira',
        p_telefone: '11999998888',
        p_cliente_id: null,
      });
      expect(response.codigo_gerado).toBe('PROT-RES-2026-EE55FF');
    });

    it('should throw an error when backend RPC fails completely', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Limite de resgates diários atingido para este parceiro.' },
      });

      await expect(
        redeemPartnerBenefit({
          parceiroSlug: 'parceiro-lotado',
          nomeCompleto: 'Carlos Silva',
          telefone: '11988887777',
          email: 'carlos@silva.com',
        })
      ).rejects.toThrow('Limite de resgates diários atingido para este parceiro.');
    });
  });

  describe('2. Protocol Format Validation (Regex ^PROT-RES-\\d{4}-[A-Z0-9]{6}$)', () => {
    const PROTOCOL_REGEX = /^PROT-RES-\d{4}-[A-Z0-9]{6}$/;

    it('should validate official protocol format regex on returned codes', async () => {
      const validProtocols = [
        'PROT-RES-2026-987654',
        'PROT-RES-2026-ABC123',
        'PROT-RES-2025-Z9Y8X7',
        'PROT-RES-2030-000001',
      ];

      for (const proto of validProtocols) {
        expect(PROTOCOL_REGEX.test(proto)).toBe(true);
      }
    });

    it('should reject malformed protocol strings', () => {
      const invalidProtocols = [
        'PROT-1234',
        'PROT-RES-26-123456',
        'RES-2026-123456',
        'PROT-RES-2026-12345', // only 5 chars
        'PROT-RES-2026-1234567', // 7 chars
        'PROT-RES-ABCD-123456', // non-numeric year
        'prot-res-2026-abcdef', // lowercase
      ];

      for (const proto of invalidProtocols) {
        expect(PROTOCOL_REGEX.test(proto)).toBe(false);
      }
    });

    it('should guarantee a fallback protocol conforming to year and format if RPC code is absent', async () => {
      const currentYear = new Date().getFullYear();
      mockRpc.mockResolvedValue({
        data: {
          success: true,
          resgate_id: 'res-fallback-001',
          partner_name: 'Parceiro Sem Protocolo',
          has_coupon: true,
          delay_24h: false,
        },
        error: null,
      });

      const updateEqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
      mockFrom.mockReturnValue({ update: updateMock });

      const response = await redeemPartnerBenefit({
        parceiroSlug: 'parceiro-fallback',
        nomeCompleto: 'Lucas Moura',
        telefone: '11977776666',
        email: 'lucas@moura.com',
      });

      expect(response.protocolo).toBeDefined();
      expect(response.protocolo).toMatch(new RegExp(`^PROT-RES-${currentYear}-\\d{6}$`));
      expect(PROTOCOL_REGEX.test(response.protocolo!)).toBe(true);
    });
  });

  describe('3. 24h SLA Flag Handling & Notifications Dispatch', () => {
    it('should flag delay_24h: true, send customer 24h SLA notice, and alert admin via WhatsApp', async () => {
      const mockResult = {
        success: true,
        resgate_id: 'res-sla-24h-001',
        partner_name: 'Hospital Veterinário 24h',
        partner_slug: 'vet-24h',
        codigo_gerado: 'PROT-RES-2026-SLA24H',
        protocolo: 'PROT-RES-2026-SLA24H',
        has_coupon: false,
        has_voucher: false,
        has_link: false,
        delay_24h: true,
      };

      mockRpc.mockResolvedValue({ data: mockResult, error: null });

      const updateEqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
      mockFrom.mockReturnValue({ update: updateMock });

      const response = await redeemPartnerBenefit({
        parceiroSlug: 'vet-24h',
        nomeCompleto: 'Juliana Costa',
        telefone: '11955554444',
        email: 'juliana@veterinaria.com',
      });

      expect(response.delay_24h).toBe(true);

      // 1. WhatsApp notification to customer with 24h SLA notice
      expect(mockEnviarWhatsAppDireto).toHaveBeenCalledWith(
        '11955554444',
        expect.stringContaining('SOLICITAÇÃO DE BENEFÍCIO REGISTRADA')
      );
      expect(mockEnviarWhatsAppDireto).toHaveBeenCalledWith(
        '11955554444',
        expect.stringContaining('PRAZO DE ATIVAÇÃO (EM ATÉ 24 HORAS)')
      );
      expect(mockEnviarWhatsAppDireto).toHaveBeenCalledWith(
        '11955554444',
        expect.stringContaining('PROT-RES-2026-SLA24H')
      );

      // 2. WhatsApp notification to Admin
      expect(mockSendAdminWhatsAppNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Hospital Veterinário 24h'),
          category: 'FORNECEDORES',
          message: expect.stringContaining('PROT-RES-2026-SLA24H'),
        })
      );
    });

    it('should dispatch immediate benefit redemption message when delay_24h is false', async () => {
      const mockResult = {
        success: true,
        resgate_id: 'res-imm-001',
        partner_name: 'Drogasil',
        partner_slug: 'drogasil',
        codigo_gerado: 'PROT-RES-2026-DROG01',
        protocolo: 'PROT-RES-2026-DROG01',
        has_coupon: true,
        has_voucher: false,
        has_link: true,
        link: 'https://drogasil.com.br/parceiro-gsa',
        instructions: 'Apresente no caixa.',
        delay_24h: false,
      };

      mockRpc.mockResolvedValue({ data: mockResult, error: null });

      const updateEqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
      mockFrom.mockReturnValue({ update: updateMock });

      const response = await redeemPartnerBenefit({
        parceiroSlug: 'drogasil',
        nomeCompleto: 'Fernando Rocha',
        telefone: '11944443333',
        email: 'fernando@rocha.com',
      });

      expect(response.delay_24h).toBe(false);
      expect(mockEnviarWhatsAppDireto).toHaveBeenCalledWith(
        '11944443333',
        expect.stringContaining('BENEFÍCIO RESGATADO COM SUCESSO')
      );
      expect(mockEnviarWhatsAppDireto).toHaveBeenCalledWith(
        '11944443333',
        expect.stringContaining('https://drogasil.com.br/parceiro-gsa')
      );
      // Admin should not receive a manual activation task for immediate coupons
      expect(mockSendAdminWhatsAppNotification).not.toHaveBeenCalled();
    });
  });

  describe('4. Admin Completion Flow (completePartnerRedemption)', () => {
    it('should throw an error when activation link is empty or whitespace', async () => {
      await expect(
        completePartnerRedemption({
          resgateId: 'res-101',
          linkAtivacao: '   ',
          partnerName: 'Petlove',
          customerName: 'Adriano',
          customerPhone: '11999998888',
        })
      ).rejects.toThrow('Informe o link de ativação gerado no site do parceiro.');
    });

    it('should update parceiros_resgates to concluido and send activation WhatsApp with link and protocol', async () => {
      const updateEqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
      mockFrom.mockReturnValue({ update: updateMock });

      const sent = await completePartnerRedemption({
        resgateId: 'res-completed-202',
        linkAtivacao: 'https://petlove.com.br/ativar?token=xyz789',
        partnerName: 'Petlove Plano de Saúde',
        benefitName: 'Primeira Mensalidade Grátis',
        customerName: 'Adriano Farias',
        customerPhone: '11971858372',
        customerEmail: 'adriano@grupogsa.com.br',
        protocolo: 'PROT-RES-2026-998877',
      });

      expect(sent).toBe(true);

      // Verify DB update
      expect(mockFrom).toHaveBeenCalledWith('parceiros_resgates');
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          link_ativacao: 'https://petlove.com.br/ativar?token=xyz789',
          status: 'concluido',
        })
      );
      expect(updateEqMock).toHaveBeenCalledWith('id', 'res-completed-202');

      // Verify WhatsApp delivery with clean, modern layout
      expect(mockEnviarWhatsAppDireto).toHaveBeenCalledWith(
        '11971858372',
        expect.stringContaining('SEU BENEFÍCIO JÁ ESTÁ DISPONÍVEL'),
        expect.anything()
      );
      expect(mockEnviarWhatsAppDireto).toHaveBeenCalledWith(
        '11971858372',
        expect.stringContaining('https://petlove.com.br/ativar?token=xyz789'),
        expect.anything()
      );
      expect(mockEnviarWhatsAppDireto).toHaveBeenCalledWith(
        '11971858372',
        expect.stringContaining('PROT-RES-2026-998877'),
        expect.anything()
      );
    });
  });

  describe('5. Partner Redemptions Admin Listing & Enrichment', () => {
    it('should list redemptions via admin RPC when available', async () => {
      const mockRedemptions = [
        {
          id: 'res-1',
          parceiro_id: 'part-1',
          nome_completo: 'Cliente Alpha',
          telefone: '11911112222',
          email: 'alpha@email.com',
          codigo_gerado: 'PROT-RES-2026-000001',
          status: 'pendente',
          created_at: '2026-08-26T12:00:00Z',
        },
      ];

      mockAdminRpc.mockResolvedValue({ redemptions: mockRedemptions });

      const list = await listPartnerRedemptions('part-1');
      expect(list).toHaveLength(1);
      expect(list[0].codigo_gerado).toBe('PROT-RES-2026-000001');
      expect(mockAdminRpc).toHaveBeenCalledWith('gsa_admin_list_partner_redemptions', {
        p_partner_id: 'part-1',
      });
    });

    it('should fallback to database query and enrich client data when admin RPC is not active', async () => {
      mockAdminRpc.mockRejectedValue(new Error('RPC gsa_admin_list_partner_redemptions not found'));

      const dbRedemptions = [
        {
          id: 'res-fallback-1',
          cliente_id: 'cli-001',
          nome_completo: 'Carlos Augusto',
          telefone: '11988887777',
          email: null,
          codigo_gerado: 'PROT-RES-2026-777888',
          status: 'pendente',
          created_at: '2026-08-26T10:00:00Z',
        },
      ];

      const clientsData = [
        {
          id: 'cli-001',
          nome: 'Carlos Augusto',
          email: 'carlos.augusto@empresa.com.br',
          telefone: '11988887777',
          cpf: '123.456.789-00',
          endereco: 'Av. Paulista, 1000',
          cidade: 'São Paulo',
          estado: 'SP',
          cep: '01310-100',
        },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'parceiros_resgates') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: dbRedemptions, error: null }),
            }),
          };
        }
        if (table === 'clientes') {
          return {
            select: vi.fn().mockResolvedValue({ data: clientsData, error: null }),
          };
        }
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      });

      const list = await listPartnerRedemptions();
      expect(list).toHaveLength(1);
      expect(list[0].email).toBe('carlos.augusto@empresa.com.br');
      expect(list[0].cpf).toBe('123.456.789-00');
      expect(list[0].endereco).toBe('Av. Paulista, 1000');
      expect(list[0].cidade).toBe('São Paulo');
    });
  });
});

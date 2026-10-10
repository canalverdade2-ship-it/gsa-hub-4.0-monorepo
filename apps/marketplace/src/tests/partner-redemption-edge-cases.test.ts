import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Storage & window polyfill for Node test runner
const memoryLocalStorage: Record<string, string> = {};
const memorySessionStorage: Record<string, string> = {};

const createMockStorage = (store: Record<string, string>) => ({
  getItem: vi.fn((key: string) => store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    Object.keys(store).forEach((k) => delete store[k]);
  }),
  length: 0,
  key: (index: number) => Object.keys(store)[index] || null,
});

const mockLocalStorage = createMockStorage(memoryLocalStorage);
const mockSessionStorage = createMockStorage(memorySessionStorage);

(global as any).localStorage = mockLocalStorage;
(global as any).sessionStorage = mockSessionStorage;

if (typeof (global as any).window === 'undefined') {
  (global as any).window = {
    localStorage: mockLocalStorage,
    sessionStorage: mockSessionStorage,
    location: { href: 'https://grupogsa.com.br/', origin: 'https://grupogsa.com.br' },
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

// Hoisted mocks for Supabase client
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockAdminRpc = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args),
    functions: {
      invoke: vi.fn(),
    },
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
  savePartner,
  getPublicPartner,
  listPublicPartners,
} from '../features/partners/service';
import type { Partner, PartnerFormData } from '../features/partners/types';

describe('Partner Benefit Redemption System & Edge Cases Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnviarWhatsAppDireto.mockResolvedValue(true);
    mockGerarMensagemWhatsApp.mockReturnValue('Mensagem formatada');
    mockSendAdminWhatsAppNotification.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Happy Path: 24h SLA Delay vs Instant Coupon Redemption
  // =========================================================================
  describe('1. Happy Paths: 24h SLA Delay vs Instant Coupon Redemption', () => {
    it('should process 24h SLA delay redemption, dispatch customer SLA notice, and alert admin via WhatsApp', async () => {
      const mockResult = {
        success: true,
        resgate_id: 'res-sla-uuid-1',
        partner_name: 'Hospital Veterinário Pet Care',
        partner_slug: 'petcare',
        benefits: '1ª Consulta Gratuita e 20% em exames',
        codigo_gerado: 'PROT-RES-2026-PCAR24',
        protocolo: 'PROT-RES-2026-PCAR24',
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
        parceiroSlug: 'petcare',
        nomeCompleto: 'Adriano de Farias',
        telefone: '(11) 97185-8372',
        email: 'adriano@grupogsa.com.br',
      });

      expect(response.success).toBe(true);
      expect(response.delay_24h).toBe(true);
      expect(response.protocolo).toBe('PROT-RES-2026-PCAR24');
      expect(response.partner_name).toBe('Hospital Veterinário Pet Care');

      // Verify customer WhatsApp dispatch with 24h SLA copy
      expect(mockEnviarWhatsAppDireto).toHaveBeenCalledWith(
        '(11) 97185-8372',
        expect.stringContaining('SOLICITAÇÃO DE BENEFÍCIO REGISTRADA!')
      );
      expect(mockEnviarWhatsAppDireto).toHaveBeenCalledWith(
        '(11) 97185-8372',
        expect.stringContaining('PRAZO DE ATIVAÇÃO (EM ATÉ 24 HORAS)')
      );
      expect(mockEnviarWhatsAppDireto).toHaveBeenCalledWith(
        '(11) 97185-8372',
        expect.stringContaining('PROT-RES-2026-PCAR24')
      );

      // Verify Admin WhatsApp notification
      expect(mockSendAdminWhatsAppNotification).toHaveBeenCalledWith({
        title: 'Novo Resgate: Hospital Veterinário Pet Care',
        category: 'FORNECEDORES',
        message: expect.stringContaining('PROT-RES-2026-PCAR24'),
      });
    });

    it('should process instant coupon redemption without 24h delay and send instant voucher details', async () => {
      const mockResult = {
        success: true,
        resgate_id: 'res-instant-uuid-2',
        partner_name: 'Óticas Carol',
        partner_slug: 'oticas-carol',
        benefits: '30% de desconto em armações e lentes',
        codigo_gerado: 'PROT-RES-2026-CAROL3',
        protocolo: 'PROT-RES-2026-CAROL3',
        has_coupon: true,
        has_voucher: false,
        has_link: true,
        link: 'https://oticascarol.com.br/gsa',
        instructions: 'Apresente este código no caixa da loja.',
        delay_24h: false,
      };

      mockRpc.mockResolvedValue({ data: mockResult, error: null });

      const updateEqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
      mockFrom.mockReturnValue({ update: updateMock });

      const response = await redeemPartnerBenefit({
        parceiroSlug: 'oticas-carol',
        nomeCompleto: 'Beatriz Silva',
        telefone: '11988881234',
        email: 'beatriz@gmail.com',
      });

      expect(response.success).toBe(true);
      expect(response.delay_24h).toBe(false);
      expect(response.protocolo).toBe('PROT-RES-2026-CAROL3');

      // Verify instant redemption message sent to customer
      expect(mockEnviarWhatsAppDireto).toHaveBeenCalledWith(
        '11988881234',
        expect.stringContaining('BENEFÍCIO RESGATADO COM SUCESSO!')
      );
      expect(mockEnviarWhatsAppDireto).toHaveBeenCalledWith(
        '11988881234',
        expect.stringContaining('https://oticascarol.com.br/gsa')
      );
      expect(mockEnviarWhatsAppDireto).toHaveBeenCalledWith(
        '11988881234',
        expect.stringContaining('Apresente este código no caixa da loja.')
      );

      // Admin should NOT receive manual action notification for immediate self-service coupons
      expect(mockSendAdminWhatsAppNotification).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 2. Protocol Generation Format Regex Validation
  // =========================================================================
  describe('2. Protocol Generation Format Validation (/^PROT-RES-\\d{4}-[A-Z0-9]{6}$/)', () => {
    const PROTOCOL_REGEX = /^PROT-RES-\d{4}-[A-Z0-9]{6}$/;

    it('should validate standard and dynamic protocol codes against the strict BACEN/GSA regex', () => {
      const validCodes = [
        'PROT-RES-2026-987654',
        'PROT-RES-2026-ABC123',
        'PROT-RES-2025-000001',
        'PROT-RES-2027-ZYX987',
        'PROT-RES-2026-A1B2C3',
      ];

      for (const code of validCodes) {
        expect(PROTOCOL_REGEX.test(code)).toBe(true);
      }
    });

    it('should invalidate malformed protocol codes', () => {
      const invalidCodes = [
        'PROT-RES-26-987654', // 2-digit year
        'PROT-RES-2026-12345', // 5-digit suffix (needs 6)
        'PROT-RES-2026-1234567', // 7-digit suffix
        'prot-res-2026-abc123', // lowercase
        'PROT-RES-ABCD-123456', // non-numeric year
        'PROT-2026-123456', // missing RES
        'PROT-RES-2026-123 56', // contains space
        'PROT-RES-2026-123!@#', // special chars
      ];

      for (const code of invalidCodes) {
        expect(PROTOCOL_REGEX.test(code)).toBe(false);
      }
    });

    it('should generate a compliant fallback protocol when RPC does not return a pre-generated code', async () => {
      const currentYear = new Date().getFullYear();

      mockRpc.mockResolvedValue({
        data: {
          success: true,
          resgate_id: 'res-no-proto',
          partner_name: 'Clube de Benefícios GSA',
          delay_24h: false,
        },
        error: null,
      });

      const updateEqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
      mockFrom.mockReturnValue({ update: updateMock });

      const result = await redeemPartnerBenefit({
        parceiroSlug: 'clube-gsa',
        nomeCompleto: 'Mariana Lima',
        telefone: '11977778888',
      });

      expect(result.protocolo).toBeDefined();
      expect(PROTOCOL_REGEX.test(result.protocolo!)).toBe(true);
      expect(result.protocolo!).toContain(`PROT-RES-${currentYear}-`);
    });
  });

  // =========================================================================
  // 3. Email, Phone, and Name Sanitization & Edge Cases
  // =========================================================================
  describe('3. Sanitization & Extreme Input Normalization', () => {
    it('should sanitize names and phones with excessive whitespace and special characters', async () => {
      mockRpc.mockResolvedValue({
        data: {
          success: true,
          resgate_id: 'res-sanitize-01',
          partner_name: 'Petlove',
          codigo_gerado: 'PROT-RES-2026-SAN001',
          delay_24h: false,
        },
        error: null,
      });

      const updateEqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
      mockFrom.mockReturnValue({ update: updateMock });

      await redeemPartnerBenefit({
        parceiroSlug: 'petlove',
        nomeCompleto: '   Dr. João Carlos dos Santos & Silva   ',
        telefone: '   +55 (11) 99876-5432   ',
        email: '   Joao.Santos@Grupogsa.com.br   ',
      });

      expect(mockRpc).toHaveBeenCalledWith('gsa_public_resgatar_beneficio_parceiro', {
        p_parceiro_id: null,
        p_parceiro_slug: 'petlove',
        p_nome_completo: 'Dr. João Carlos dos Santos & Silva',
        p_telefone: '+55 (11) 99876-5432',
        p_cliente_id: null,
        p_email: 'Joao.Santos@Grupogsa.com.br',
      });
    });

    it('should handle optional email when null or undefined without breaking RPC payload', async () => {
      mockRpc.mockResolvedValue({
        data: {
          success: true,
          resgate_id: 'res-no-email',
          partner_name: 'Drogasil',
          codigo_gerado: 'PROT-RES-2026-DROG02',
          delay_24h: false,
        },
        error: null,
      });

      const updateEqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
      mockFrom.mockReturnValue({ update: updateMock });

      const res = await redeemPartnerBenefit({
        parceiroSlug: 'drogasil',
        nomeCompleto: 'Ana Paula Souza',
        telefone: '11944445555',
      });

      expect(res.success).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('gsa_public_resgatar_beneficio_parceiro', {
        p_parceiro_id: null,
        p_parceiro_slug: 'drogasil',
        p_nome_completo: 'Ana Paula Souza',
        p_telefone: '11944445555',
        p_cliente_id: null,
      });
    });

    it('should gracefully fallback when database update of redemption email/protocol fails', async () => {
      mockRpc.mockResolvedValue({
        data: {
          success: true,
          resgate_id: 'res-db-fail-update',
          partner_name: 'Petlove',
          codigo_gerado: 'PROT-RES-2026-FAIL01',
          delay_24h: false,
        },
        error: null,
      });

      const updateEqMock = vi.fn().mockRejectedValue(new Error('DB connection reset'));
      const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
      mockFrom.mockReturnValue({ update: updateMock });

      const response = await redeemPartnerBenefit({
        parceiroSlug: 'petlove',
        nomeCompleto: 'Gabriel Costa',
        telefone: '11911112222',
        email: 'gabriel@email.com',
      });

      // The function must succeed and return the redemption even if background update fails
      expect(response.success).toBe(true);
      expect(response.codigo_gerado).toBe('PROT-RES-2026-FAIL01');
    });
  });

  // =========================================================================
  // 4. Admin Completion Flow (completePartnerRedemption)
  // =========================================================================
  describe('4. Admin Completion Flow & Activation Link Delivery', () => {
    it('should reject activation completion when linkAtivacao is empty or whitespace', async () => {
      await expect(
        completePartnerRedemption({
          resgateId: 'res-empty-link',
          linkAtivacao: '   ',
          partnerName: 'Petlove',
          customerName: 'Adriano',
          customerPhone: '11999998888',
        })
      ).rejects.toThrow('Informe o link de ativação gerado no site do parceiro.');
    });

    it('should complete redemption, update database with activation timestamp, and send formatted WhatsApp message', async () => {
      const updateEqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
      mockFrom.mockReturnValue({ update: updateMock });

      const success = await completePartnerRedemption({
        resgateId: 'res-complete-99',
        linkAtivacao: 'https://petlove.com.br/convenio/ativar?cupom=GSA100OFF',
        partnerName: 'Petlove Saúde Animal',
        benefitName: '100% de desconto na primeira mensalidade do plano pet',
        customerName: 'Adriano Farias',
        customerPhone: '11971858372',
        customerEmail: 'adriano@grupogsa.com.br',
        protocolo: 'PROT-RES-2026-PET100',
      });

      expect(success).toBe(true);

      // Verify DB update
      expect(mockFrom).toHaveBeenCalledWith('parceiros_resgates');
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          link_ativacao: 'https://petlove.com.br/convenio/ativar?cupom=GSA100OFF',
          status: 'concluido',
          data_ativacao: expect.any(String),
        })
      );
      expect(updateEqMock).toHaveBeenCalledWith('id', 'res-complete-99');

      // Verify WhatsApp content formatting (clean layout)
      expect(mockEnviarWhatsAppDireto).toHaveBeenCalledWith(
        '11971858372',
        expect.stringContaining('SEU BENEFÍCIO JÁ ESTÁ DISPONÍVEL'),
        expect.anything()
      );
      expect(mockEnviarWhatsAppDireto).toHaveBeenCalledWith(
        '11971858372',
        expect.stringContaining('https://petlove.com.br/convenio/ativar?cupom=GSA100OFF'),
        expect.anything()
      );
      expect(mockEnviarWhatsAppDireto).toHaveBeenCalledWith(
        '11971858372',
        expect.stringContaining('PROT-RES-2026-PET100'),
        expect.anything()
      );
    });

    it('should complete redemption smoothly when optional fields (benefitName, customerEmail, protocolo) are omitted', async () => {
      const updateEqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
      mockFrom.mockReturnValue({ update: updateMock });

      const success = await completePartnerRedemption({
        resgateId: 'res-minimal-info',
        linkAtivacao: 'https://convenio.com/ativar',
        partnerName: 'Parceiro Genérico',
        customerName: 'Renata Souza',
        customerPhone: '11966665555',
      });

      expect(success).toBe(true);
      expect(mockEnviarWhatsAppDireto).toHaveBeenCalledWith(
        '11966665555',
        expect.stringContaining('https://convenio.com/ativar'),
        expect.anything()
      );
    });
  });

  // =========================================================================
  // 5. Admin Listing & Enrichment Edge Cases
  // =========================================================================
  describe('5. Admin Listing, Filtering & Client Data Enrichment', () => {
    it('should list redemptions from RPC and fallback correctly when RPC is unavailable', async () => {
      mockAdminRpc.mockRejectedValue(new Error('RPC missing'));

      const dbRedemptions = [
        {
          id: 'res-enrich-1',
          cliente_id: 'cli-001',
          nome_completo: 'Carlos Eduardo',
          telefone: '(11) 98888-7777',
          email: null,
          codigo_gerado: 'PROT-RES-2026-112233',
          status: 'pendente',
          created_at: '2026-08-26T10:00:00Z',
        },
      ];

      const clientRecords = [
        {
          id: 'cli-001',
          nome: 'Carlos Eduardo',
          email: 'carlos.eduardo@empresa.com.br',
          telefone: '11988887777',
          cpf: '333.444.555-66',
          endereco: 'Rua Augusta, 500',
          cidade: 'São Paulo',
          estado: 'SP',
          cep: '01305-000',
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
            select: vi.fn().mockResolvedValue({ data: clientRecords, error: null }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const list = await listPartnerRedemptions();
      expect(list).toHaveLength(1);
      expect(list[0].email).toBe('carlos.eduardo@empresa.com.br');
      expect(list[0].cpf).toBe('333.444.555-66');
      expect(list[0].endereco).toBe('Rua Augusta, 500');
      expect(list[0].cidade).toBe('São Paulo');
    });

    it('should save partner normalizing fields and ensuring boolean flags', async () => {
      const partnerFormData: PartnerFormData = {
        slug: '',
        name: '  Parceiro Novo Teste  ',
        category: '  Saúde & Estética  ',
        short_description: 'Descrição curta',
        service_mode: 'online',
        service_regions: ['Nacional'],
        services: ['Consultoria'],
        products: [],
        benefits: '10% de desconto',
        featured: true,
        display_order: 1,
        status: 'ativo',
        redemption_has_coupon: true,
        redemption_coupon_code: 'TESTE10',
        redemption_delay_24h: false,
      };

      const savedResult = {
        id: 'new-partner-uuid',
        slug: 'parceiro-novo-teste',
        name: 'Parceiro Novo Teste',
        category: 'Saúde & Estética',
        short_description: 'Descrição curta',
        service_mode: 'online',
        service_regions: ['Nacional'],
        services: ['Consultoria'],
        products: [],
        benefits: '10% de desconto',
        featured: true,
        display_order: 1,
        status: 'ativo',
        redemption_has_coupon: true,
        redemption_coupon_code: 'TESTE10',
        redemption_delay_24h: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockAdminRpc.mockResolvedValue({ partner: savedResult });

      const saved = await savePartner(partnerFormData);
      expect(saved.slug).toBe('parceiro-novo-teste');
      expect(saved.name).toBe('Parceiro Novo Teste');
      expect(saved.redemption_has_coupon).toBe(true);
      expect(mockAdminRpc).toHaveBeenCalledWith('gsa_admin_save_partner', expect.objectContaining({
        p_payload: expect.objectContaining({
          slug: 'parceiro-novo-teste',
          name: 'Parceiro Novo Teste',
        }),
      }));
    });
  });
});

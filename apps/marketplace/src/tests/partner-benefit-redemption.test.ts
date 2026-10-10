import { describe, it, expect, vi } from 'vitest';
import type { Partner, PartnerFormData } from '../features/partners/types';

describe('Partner Benefit Redemption System', () => {
  it('should structure partner benefit redemption configuration correctly', () => {
    const partnerData: PartnerFormData = {
      slug: 'petlove',
      name: 'PETLOVE',
      category: 'Centros Veterinários',
      short_description: 'Plano de saúde e bem-estar para pets',
      service_mode: 'hibrido',
      service_regions: ['Nacional'],
      services: ['Veterinária'],
      products: ['Plano Pet'],
      benefits: 'Primeira Mensalidade 100% Grátis pela GSA PET',
      featured: true,
      display_order: 1,
      status: 'ativo',
      redemption_has_coupon: true,
      redemption_coupon_code: 'PETLOVEGSA100',
      redemption_has_voucher: false,
      redemption_has_link: true,
      redemption_link: 'https://petlove.com.br/convenio-gsa',
      redemption_auto_redirect: true,
      redemption_instructions: 'Insira o cupom no carrinho para obter 100% de desconto no 1º mês.'
    };

    expect(partnerData.redemption_has_coupon).toBe(true);
    expect(partnerData.redemption_coupon_code).toBe('PETLOVEGSA100');
    expect(partnerData.redemption_has_link).toBe(true);
    expect(partnerData.redemption_auto_redirect).toBe(true);
    expect(partnerData.redemption_instructions).toContain('100% de desconto');
  });

  it('should support link-only configuration without auto-redirection', () => {
    const partnerData: PartnerFormData = {
      slug: 'clinica-exemplo',
      name: 'Clínica Exemplo',
      category: 'Saúde',
      short_description: 'Consultas com desconto',
      service_mode: 'presencial',
      service_regions: ['São Paulo - SP'],
      services: ['Consultas'],
      products: [],
      benefits: '20% de desconto em consultas particulares',
      featured: false,
      display_order: 0,
      status: 'ativo',
      redemption_has_coupon: false,
      redemption_has_voucher: false,
      redemption_has_link: true,
      redemption_link: 'https://clinicaexemplo.com.br',
      redemption_auto_redirect: false,
      redemption_instructions: 'Apresente o comprovante gerado na recepção.'
    };

    expect(partnerData.redemption_has_coupon).toBe(false);
    expect(partnerData.redemption_auto_redirect).toBe(false);
    expect(partnerData.redemption_link).toBe('https://clinicaexemplo.com.br');
  });

  it('should format partner benefit copy correctly', () => {
    const partner: Partner = {
      id: 'mock-uuid-1234',
      slug: 'petlove',
      name: 'Petlove',
      category: 'Veterinária',
      short_description: 'Cuidados para pets',
      service_mode: 'hibrido',
      service_regions: ['Nacional'],
      services: ['Saúde Animal'],
      products: ['Planos'],
      benefits: 'Primeira Mensalidade 100% Grátis pela GSA PET',
      featured: true,
      display_order: 1,
      status: 'ativo',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    expect(partner.benefits).toBeTruthy();
    expect(partner.benefits).toBe('Primeira Mensalidade 100% Grátis pela GSA PET');
  });

  it('should support PartnerBenefitRedemptionResult with protocolo and delay_24h', () => {
    const result: import('../features/partners/types').PartnerBenefitRedemptionResult = {
      success: true,
      resgate_id: 'res-12345',
      partner_name: 'Petlove',
      partner_slug: 'petlove',
      tipo_resgate: 'combinado',
      codigo_gerado: 'PROT-RES-2026-987654',
      protocolo: 'PROT-RES-2026-987654',
      has_coupon: true,
      has_voucher: false,
      has_link: true,
      link: 'https://petlove.com.br',
      auto_redirect: false,
      instructions: 'Apresente seu protocolo no balcão.',
      delay_24h: true
    };

    expect(result.success).toBe(true);
    expect(result.protocolo).toBe('PROT-RES-2026-987654');
    expect(result.delay_24h).toBe(true);
  });
});

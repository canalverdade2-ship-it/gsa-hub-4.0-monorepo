import { describe, expect, it } from 'vitest';
import { 
  getStatusBadgeVariant, 
  getStatusBadgeLabel,
  StatusBadge,
  TacticalDataGrid,
  CommandSlideOver,
  SplitScreenLayout
} from '../components/admin/super-domains/shared';

describe('Enterprise Light Foundations & Shared Components', () => {
  describe('StatusBadge Mapping Engine', () => {
    it('should map success statuses to emerald variant', () => {
      expect(getStatusBadgeVariant('pago')).toBe('emerald');
      expect(getStatusBadgeVariant('paga')).toBe('emerald');
      expect(getStatusBadgeVariant('aprovado')).toBe('emerald');
      expect(getStatusBadgeVariant('ativo')).toBe('emerald');
      expect(getStatusBadgeVariant('concluido')).toBe('emerald');
      expect(getStatusBadgeVariant('finalizado')).toBe('emerald');
      expect(getStatusBadgeVariant('online')).toBe('emerald');
    });

    it('should map pending and review statuses to amber variant', () => {
      expect(getStatusBadgeVariant('pendente')).toBe('amber');
      expect(getStatusBadgeVariant('em_analise')).toBe('amber');
      expect(getStatusBadgeVariant('aguardando')).toBe('amber');
      expect(getStatusBadgeVariant('agendado')).toBe('amber');
      expect(getStatusBadgeVariant('warning')).toBe('amber');
    });

    it('should map danger and overdue statuses to rose variant', () => {
      expect(getStatusBadgeVariant('vencido')).toBe('rose');
      expect(getStatusBadgeVariant('cancelado')).toBe('rose');
      expect(getStatusBadgeVariant('rejeitado')).toBe('rose');
      expect(getStatusBadgeVariant('bloqueado')).toBe('rose');
      expect(getStatusBadgeVariant('failed')).toBe('rose');
      expect(getStatusBadgeVariant('inadimplente')).toBe('rose');
    });

    it('should map processing and execution statuses to blue variant', () => {
      expect(getStatusBadgeVariant('em_andamento')).toBe('blue');
      expect(getStatusBadgeVariant('processando')).toBe('blue');
      expect(getStatusBadgeVariant('executando')).toBe('blue');
      expect(getStatusBadgeVariant('em_transito')).toBe('blue');
      expect(getStatusBadgeVariant('aberto')).toBe('blue');
    });

    it('should map special/VIP statuses to indigo variant', () => {
      expect(getStatusBadgeVariant('vip')).toBe('indigo');
      expect(getStatusBadgeVariant('destaque')).toBe('indigo');
      expect(getStatusBadgeVariant('premium')).toBe('indigo');
    });

    it('should fallback unknown/null statuses to slate variant', () => {
      expect(getStatusBadgeVariant(null)).toBe('slate');
      expect(getStatusBadgeVariant(undefined)).toBe('slate');
      expect(getStatusBadgeVariant('desconhecido')).toBe('slate');
      expect(getStatusBadgeVariant('')).toBe('slate');
    });

    it('should return human-readable Portuguese labels', () => {
      expect(getStatusBadgeLabel('pago')).toBe('Pago');
      expect(getStatusBadgeLabel('aguardando_aprovacao')).toBe('Aguard. Aprovação');
      expect(getStatusBadgeLabel('em_analise')).toBe('Em Análise');
      expect(getStatusBadgeLabel('em_andamento')).toBe('Em Andamento');
      expect(getStatusBadgeLabel('inadimplente')).toBe('Inadimplente');
      expect(getStatusBadgeLabel('custom_service_state')).toBe('Custom Service State');
    });
  });

  describe('Component Exports & Definitions', () => {
    it('should have StatusBadge, TacticalDataGrid, CommandSlideOver, and SplitScreenLayout defined', () => {
      expect(typeof StatusBadge).toBe('function');
      expect(typeof TacticalDataGrid).toBe('function');
      expect(typeof CommandSlideOver).toBe('function');
      expect(typeof SplitScreenLayout).toBe('function');
    });
  });
});

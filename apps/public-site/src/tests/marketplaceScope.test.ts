import { describe, expect, it } from 'vitest';
import {
  isMarketplaceAdminRoute,
  isMarketplaceBusinessRoute,
  isMarketplaceClientRoute,
  isMarketplaceNotification,
} from '../routing/marketplaceScope';

describe('escopo do painel antigo exclusivo do Marketplace', () => {
  it('mantém módulos do Marketplace no painel do cliente', () => {
    expect(isMarketplaceClientRoute('dashboard')).toBe(true);
    expect(isMarketplaceClientRoute('perfil')).toBe(true);
    expect(isMarketplaceClientRoute('gsa_store')).toBe(true);
    expect(isMarketplaceClientRoute('financeiro')).toBe(true);
    expect(isMarketplaceClientRoute('fidelidade')).toBe(true);
    expect(isMarketplaceClientRoute('suporte')).toBe(true);
  });

  it('bloqueia módulos antigos de serviços do cliente e da empresa', () => {
    for (const module of ['servicos_assinaturas', 'orcamentos', 'servicos', 'produtos', 'assinaturas']) {
      expect(isMarketplaceClientRoute(module)).toBe(false);
    }
    expect(isMarketplaceBusinessRoute('servicos_assinaturas')).toBe(false);
  });

  it('mantém apenas operações e catálogos do Marketplace no administrador', () => {
    expect(isMarketplaceAdminRoute('dashboard')).toBe(true);
    expect(isMarketplaceAdminRoute('cadastro', 'clientes')).toBe(true);
    expect(isMarketplaceAdminRoute('loja', 'produtos')).toBe(true);
    expect(isMarketplaceAdminRoute('loja', 'assinaturas')).toBe(true);
    expect(isMarketplaceAdminRoute('operacoes', 'produtos')).toBe(true);
    expect(isMarketplaceAdminRoute('operacoes', 'assinaturas')).toBe(true);

    expect(isMarketplaceAdminRoute('prestadores')).toBe(false);
    expect(isMarketplaceAdminRoute('demandas')).toBe(false);
    expect(isMarketplaceAdminRoute('cadastros', 'prestadores')).toBe(false);
    expect(isMarketplaceAdminRoute('loja', 'servicos')).toBe(false);
    expect(isMarketplaceAdminRoute('loja', 'pacotes')).toBe(false);
    expect(isMarketplaceAdminRoute('operacoes', 'orcamentos')).toBe(false);
    expect(isMarketplaceAdminRoute('operacoes', 'os')).toBe(false);
  });

  it('filtra notificações que levam aos módulos removidos', () => {
    expect(isMarketplaceNotification({ modulo: 'produtos' })).toBe(true);
    expect(isMarketplaceNotification({ modulo: 'assinaturas' })).toBe(true);
    expect(isMarketplaceNotification({ modulo: 'servicos' })).toBe(false);
    expect(isMarketplaceNotification({ modulo: 'demandas' })).toBe(false);
    expect(isMarketplaceNotification({ modulo: 'operacoes', tab: 'produtos' })).toBe(true);
    expect(isMarketplaceNotification({ modulo: 'operacoes', tab: 'orcamentos' })).toBe(false);
    expect(isMarketplaceNotification({ link: '/admin/loja/servicos' })).toBe(false);
  });
});

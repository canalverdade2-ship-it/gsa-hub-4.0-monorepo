import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProtectionMarketplace } from '../components/client/marketplace/protection/ProtectionMarketplace';
vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../lib/clientRpc', () => ({ callClientRpc: vi.fn() }));
vi.mock('../routing/navigationService', () => ({ navigate: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
const categories = [
  ['saude', 'individual-familiar', 'Individual e Familiar'],
  ['saude', 'empresarial', 'Empresarial'],
  ['saude', 'odontologico', 'Odontológico'],
  ['seguros', 'auto', 'Seguro Auto'],
  ['seguros', 'residencial', 'Residencial'],
  ['seguros', 'vida', 'Vida'],
  ['seguros', 'empresarial', 'Empresarial'],
  ['seguros', 'viagem', 'Viagem'],
  ['seguros', 'outros', 'Outros Seguros'],
] as const;
describe('Protection quotes on HTTP LAN without crypto.randomUUID', () => {
  it.each(categories)('opens %s / %s', (domain, category, label) => {
    vi.stubGlobal('crypto', {});
    vi.stubGlobal('sessionStorage', { getItem: () => null });
    const html = renderToString(<ProtectionMarketplace domain={domain} submodule="cotacao" itemId={category} onBackToMarketplace={() => {}} />);
    expect(html).toContain(label);
    expect(html).toContain('A categoria foi definida');
  });
  it('opens even when a saved draft is invalid', () => {
    vi.stubGlobal('crypto', {});
    vi.stubGlobal('sessionStorage', { getItem: () => '{invalid' });
    expect(() => renderToString(<ProtectionMarketplace domain="seguros" submodule="cotacao" itemId="auto" onBackToMarketplace={() => {}} />)).not.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { applyVariantToProduct, createVariantCombinations, findVariantForSelections } from '../lib/productVariations';
import { variationSelectionLabel, type ProductVariationsPayload } from '../types/productVariations';

const variations: ProductVariationsPayload = {
  grupos: [
    {
      chave: 'cor',
      nome: 'Cor',
      tipo: 'cor',
      opcoes: [
        { chave: 'azul', nome: 'Azul' },
        { chave: 'preto', nome: 'Preto' },
      ],
    },
    {
      chave: 'tamanho',
      nome: 'Tamanho',
      tipo: 'tamanho',
      opcoes: [
        { chave: 'p', nome: 'P' },
        { chave: 'm', nome: 'M' },
      ],
    },
  ],
  variantes: [],
};

describe('product variations', () => {
  it('gera o produto cartesiano de todas as opções', () => {
    const combinations = createVariantCombinations(variations.grupos);

    expect(combinations).toHaveLength(4);
    expect(combinations.map((variant) => variant.selecoes)).toContainEqual({ cor: 'azul', tamanho: 'm' });
    expect(combinations.map((variant) => variant.combinacao)).toContainEqual({ Cor: 'Preto', Tamanho: 'P' });
  });

  it('encontra somente a combinação completa escolhida', () => {
    const payload = { ...variations, variantes: createVariantCombinations(variations.grupos) };

    expect(findVariantForSelections(payload, { cor: 'azul' })).toBeNull();
    expect(findVariantForSelections(payload, { cor: 'azul', tamanho: 'p' })?.nome).toBe('Azul / P');
  });

  it('aplica preço, estoque e imagem da variante ao produto', () => {
    const product = {
      id: 'product-1',
      valor: 100,
      valor_custo: 60,
      imagem_url: 'base.jpg',
      controle_estoque: false,
      estoque_disponivel: 0,
      desconto_ativo: true,
      desconto_tipo: 'porcentagem',
      desconto_valor: 10,
      valor_promocional: 90,
    };
    const variant = {
      id: 'variant-1',
      chave: 'azul_p',
      valor: 120,
      valor_custo: 70,
      imagem_url: 'azul.jpg',
      controle_estoque: true,
      estoque_disponivel: 3,
      selecoes: { cor: 'azul', tamanho: 'p' },
      combinacao: { Cor: 'Azul', Tamanho: 'P' },
    };

    const result = applyVariantToProduct(product, variant);

    expect(result.valor).toBe(120);
    expect(result.valor_promocional).toBe(108);
    expect(result.estoque_disponivel).toBe(3);
    expect(result.imagem_url).toBe('azul.jpg');
  });

  it('formata a seleção para carrinho e pedido', () => {
    expect(variationSelectionLabel({ Cor: 'Azul', Tamanho: 'M' })).toBe('Cor: Azul · Tamanho: M');
  });
});

import {
  extractShopeeProductFromHtml,
  extractShopeeProductIds,
  parseShopeeProductPayload,
} from './product_variation_parser.ts';

function assertEquals(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}`);
  }
}

Deno.test('extrai IDs dos formatos de URL da Shopee', () => {
  assertEquals(
    extractShopeeProductIds('https://shopee.com.br/Vestido-i.123456.987654'),
    { shopId: '123456', itemId: '987654' },
    'URL amigavel',
  );
  assertEquals(
    extractShopeeProductIds('https://shopee.com.br/product/123456/987654'),
    { shopId: '123456', itemId: '987654' },
    'URL product',
  );
});

Deno.test('normaliza grupos, opcoes, combinacoes, estoque e preco da Shopee', () => {
  const parsed = parseShopeeProductPayload({
    data: {
      name: 'Vestido Midi',
      description: 'Vestido com variacoes',
      currency: 'BRL',
      price: 5990000,
      images: ['main-image'],
      tier_variations: [
        { name: 'Cor', options: [{ option: 'Azul', image: 'azul-image' }, { option: 'Preto', image: 'preto-image' }] },
        { name: 'Tamanho', options: ['P', 'M'] },
      ],
      models: [
        { modelid: 11, name: 'Azul, P', tier_index: [0, 0], price: 5990000, stock: 3, model_sku: 'AZ-P' },
        { modelid: 12, name: 'Preto, M', tier_index: [1, 1], price: 6490000, stock: 5, model_sku: 'PR-M' },
      ],
    },
  });

  assertEquals(parsed.preco, 59.9, 'preco base');
  assertEquals(parsed.variacoes.grupos.map((group) => group.tipo), ['cor', 'tamanho'], 'tipos');
  assertEquals(parsed.variacoes.variantes[0].selecoes, { cor: 'azul', tamanho: 'p' }, 'selecao');
  assertEquals(parsed.variacoes.variantes[1].valor_custo, 64.9, 'preco da combinacao');
  assertEquals(parsed.variacoes.variantes[1].estoque_disponivel, 5, 'estoque da combinacao');
});

Deno.test('localiza grade da Shopee em JSON incorporado ao HTML', () => {
  const html = `<html><script type="application/json">${JSON.stringify({
    props: { item: {
      name: 'Tenis', price: 10000000,
      tier_variations: [{ name: 'Numero', options: ['38', '39'] }],
      models: [{ modelid: 1, tier_index: [0], price: 10000000, stock: 2 }],
    } },
  })}</script></html>`;
  const parsed = extractShopeeProductFromHtml(html);
  assertEquals(parsed?.variacoes.grupos[0].tipo, 'numero', 'tipo numero');
  assertEquals(parsed?.variacoes.variantes.length, 1, 'quantidade de modelos');
});

import { fixUtf8Encoding, validateAndNormalizeProducts } from './product_import_schema.ts';

function assertEquals(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}`);
  }
}

Deno.test('repara caracteres UTF-8 decodificados como Windows-1252', () => {
  assertEquals(fixUtf8Encoding('Pre\u00C3\u00A7o'), 'Preço', 'cedilha');
  assertEquals(fixUtf8Encoding('\u00C3\u2030tico'), 'Ético', 'E maiúsculo acentuado');
  assertEquals(fixUtf8Encoding('\u00C3\u201Ctimo'), 'Ótimo', 'O maiúsculo acentuado');
  assertEquals(fixUtf8Encoding('\u00C3\u0161nico'), 'Único', 'U maiúsculo acentuado');
  assertEquals(fixUtf8Encoding('\u00C3\u0081gua'), 'Água', 'A maiúsculo acentuado');
});

Deno.test('preserva texto Unicode que já está correto', () => {
  assertEquals(fixUtf8Encoding('AÇÃO E INFORMAÇÃO'), 'AÇÃO E INFORMAÇÃO', 'texto correto');
  assertEquals(fixUtf8Encoding('Produto 日本語'), 'Produto 日本語', 'Unicode não latino');
});

Deno.test('normaliza nome, descrição, custo e código de barras', () => {
  const result = validateAndNormalizeProducts({
    products: [{
      name: 'Caf\u00C3\u00A9 Premium',
      description: '<b>Sele\u00C3\u00A7\u00C3\u00A3o especial</b>',
      cost: 'R$ 1.234,56',
      barcode: '789-12345-6789',
      confidence: 0.9,
    }],
    warnings: ['Aten\u00C3\u00A7\u00C3\u00A3o'],
  });

  assertEquals(result.products.length, 1, 'quantidade');
  assertEquals(result.products[0]?.name, 'Café Premium', 'nome');
  assertEquals(result.products[0]?.description, 'Seleção especial', 'descrição');
  assertEquals(result.products[0]?.cost, 1234.56, 'custo');
  assertEquals(result.products[0]?.barcode, '789123456789', 'código de barras');
  assertEquals(result.warnings[0], 'Atenção', 'aviso');
});

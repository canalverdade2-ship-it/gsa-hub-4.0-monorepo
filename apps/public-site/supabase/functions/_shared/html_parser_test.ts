import { parseProductHtml } from "./html_parser.ts";

// Simple test runner for Deno
async function runTests() {
  let passed = 0;
  let failed = 0;

  const assertEqual = (actual: any, expected: any, name: string) => {
    if (actual === expected) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.error(`❌ ${name}`);
      console.error(`   Expected: ${expected}`);
      console.error(`   Actual:   ${actual}`);
      failed++;
    }
  };

  console.log("Running HTML Parser Tests...\n");

  // Test 1: JSON-LD simple
  const html1 = `
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@type": "Product",
            "name": "Super Sapato",
            "description": "Sapato muito legal",
            "image": "https://example.com/sapato.jpg",
            "offers": {
              "price": "199.90",
              "priceCurrency": "BRL"
            },
            "brand": { "name": "Marca Legal" }
          }
        </script>
      </head>
    </html>
  `;
  const res1 = parseProductHtml(html1, "https://example.com/p1");
  assertEqual(res1.nome, "Super Sapato", "JSON-LD: Name extraction");
  assertEqual(res1.preco, 199.9, "JSON-LD: Price extraction");
  assertEqual(res1.moeda, "BRL", "JSON-LD: Currency extraction");
  assertEqual(res1.nome_fornecedor, "Marca Legal", "JSON-LD: Brand extraction");
  assertEqual(res1.imagens[0], "https://example.com/sapato.jpg", "JSON-LD: Image extraction");

  // Test 2: Open Graph
  const html2 = `
    <html>
      <head>
        <meta property="og:title" content="Camiseta Básica">
        <meta property="og:description" content="Camiseta 100% algodão">
        <meta property="og:image" content="/images/cam.png">
        <meta property="product:price:amount" content="49,99">
        <meta property="product:price:currency" content="BRL">
        <meta property="og:site_name" content="LojaTop">
      </head>
    </html>
  `;
  const res2 = parseProductHtml(html2, "https://lojatop.com/cam");
  assertEqual(res2.nome, "Camiseta Básica", "OG: Name extraction");
  assertEqual(res2.preco, 49.99, "OG: Price extraction");
  assertEqual(res2.moeda, "BRL", "OG: Currency extraction");
  assertEqual(res2.imagens[0], "https://lojatop.com/images/cam.png", "OG: Absolute Image URL");
  assertEqual(res2.nome_fornecedor, "LojaTop", "OG: Site name");

  console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
}

runTests();

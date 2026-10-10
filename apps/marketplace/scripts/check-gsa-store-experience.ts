import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertContains(relativePath: string, markers: string[]): void {
  const content = read(relativePath);
  for (const marker of markers) {
    if (!content.includes(marker)) {
      throw new Error(`${relativePath}: contrato da GSA Store ausente: ${marker}`);
    }
  }
}

function assertNotContains(relativePath: string, markers: string[]): void {
  const content = read(relativePath).toLowerCase();
  for (const marker of markers) {
    if (content.includes(marker.toLowerCase())) {
      throw new Error(`${relativePath}: padrão visual proibido encontrado: ${marker}`);
    }
  }
}

assertContains('src/main.tsx', ["import './gsa-store.css';"]);

assertContains('src/gsa-store.css', [
  '--gsa-store-navy: #17345f',
  'body:has(#storeSearchInput)',
  '[role="dialog"]',
  '@media (max-width: 767px)',
  '@media (prefers-reduced-motion: reduce)',
]);

assertContains('src/components/client/store/StoreItemCard.tsx', [
  'role="link"',
  'loading="lazy"',
  "{isOutOfStock ? 'Indisponível' : 'Adicionar'}",
  'aria-label={`Ver detalhes de ${item.nome}`}',
]);
assertNotContains('src/components/client/store/StoreItemCard.tsx', [
  'animate-bounce',
  'animate-pulse',
  'from-indigo-600 to-purple-700',
]);

assertContains('src/components/client/store/ProductDetailsModal.tsx', [
  'Compra protegida',
  'Entrega acompanhada',
  'aria-label="Imagem anterior"',
  'Produto temporariamente esgotado',
  "tipo === 'assinatura' ? 'Escolher período'",
]);

assertContains('src/components/client/store/QuantityModal.tsx', [
  'Preço e estoque serão confirmados no checkout.',
  'aria-label="Diminuir quantidade"',
  'aria-label="Aumentar quantidade"',
  'getProductQuantityPriceBreakdown',
]);

assertContains('src/components/client/store/SubscriptionDurationModal.tsx', [
  'Total do período',
  'As condições, cobranças futuras e regras de cancelamento ficam registradas no pedido.',
  'aria-pressed={months === option}',
  'Continuar com {months}',
]);

assertContains('src/components/client/store/FilterModal.tsx', [
  'Encontre com mais facilidade',
  'aria-pressed={selected}',
  'aria-invalid={hasInvalidRange}',
  'O preço máximo precisa ser igual ou maior que o preço mínimo.',
]);

assertContains('src/components/client/store/AvailableCouponsModal.tsx', [
  'Nenhum benefício disponível',
  'Compra mínima de',
  'focus-visible:ring-[#9b742f]',
]);
assertNotContains('src/components/client/store/AvailableCouponsModal.tsx', [
  'shimmer',
  'from-blue-50 to-blue-100',
]);

assertContains('src/components/client/store/CartDrawer.tsx', [
  'Seu carrinho',
  'Frete calculado no checkout',
  'Preços e estoque serão validados antes da confirmação.',
  'Remova os itens indisponíveis para continuar.',
  'aria-labelledby="gsa-cart-title"',
]);

assertContains('src/components/client/store/CheckoutPage.tsx', [
  'gsa_client_checkout_store',
  'request_id: checkoutRequestId.current',
  'Remova os produtos excluídos ou esgotados do carrinho antes de finalizar.',
  'visivel_na_loja',
  'estoque_disponivel',
]);

assertContains('src/components/client/store/StoreHubPurchases.tsx', [
  'Meus pedidos',
  'Aguardando pagamento',
  'Pagamento aprovado',
  'Acompanhar',
  'Solicitar cancelamento',
  'Pedidos cancelados permanecem disponíveis para consulta e histórico.',
]);

console.log('Experiência completa da GSA Store validada.');

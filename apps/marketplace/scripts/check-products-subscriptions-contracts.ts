import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertContains(relativePath: string, expected: string[]): void {
  const content = read(relativePath);
  for (const marker of expected) {
    if (!content.includes(marker)) {
      throw new Error(`${relativePath}: contrato ausente: ${marker}`);
    }
  }
}

function assertNotContains(relativePath: string, forbidden: string[]): void {
  const content = read(relativePath).toLowerCase();
  for (const marker of forbidden) {
    if (content.includes(marker.toLowerCase())) {
      throw new Error(`${relativePath}: conteúdo proibido encontrado: ${marker}`);
    }
  }
}

assertContains('src/lib/adminStoreOperations.ts', [
  'gsa_admin_adjust_product_stock',
  'gsa_admin_transition_store_order',
  'gsa_admin_cancel_store_order',
  'gsa_admin_activate_subscription',
  'gsa_admin_save_product_catalog',
  'gsa_admin_save_subscription_catalog',
  'gsa_admin_archive_catalog_items',
]);

assertContains('src/lib/publicStoreImage.ts', [
  'MAX_STORE_IMAGE_SIZE',
  'validatePublicStoreImage',
  'generateUUID()',
  'removeUnusedPublicStoreImages',
]);

assertContains('src/components/admin/ProdutosModule.tsx', [
  "query.in('tipo_cliente', [tipoClienteFilter, 'ambos'])",
  "const safeSearch = search.replace(/[,()]/g, ' ').trim()",
  "produto.tipo_cliente === 'pj' ? 'PJ' : 'Ambos'",
  'adjustAdminProductStock',
  'saveAdminProductCatalog',
  "archiveAdminCatalogItems('produto'",
]);

assertContains('src/components/admin/AssinaturasModule.tsx', [
  "const safeSearch = search.replace(/[,()]/g, ' ').trim()",
  'saveAdminSubscriptionCatalog',
  "archiveAdminCatalogItems('assinatura'",
  'uploadPublicStoreImage',
]);

assertContains('src/components/admin/OrdensCompraModule.tsx', [
  'transitionAdminStoreOrder',
  'cancelAdminStoreOrder',
  'refund_created',
]);

assertContains('src/components/admin/OrdensAssinaturaModule.tsx', [
  'activateAdminSubscription',
  'activationRequestId',
  'nome_assinatura_contratada',
  'valor_mensal_contratado',
  'Faturas pagas serão preservadas',
]);
assertNotContains('src/components/admin/OrdensAssinaturaModule.tsx', [
  'valor proporcional estimado de devolução',
]);

assertContains('src/components/client/ClientProdutos.tsx', [
  "'em_expedicao'",
  "'em_transporte'",
  'nome_produto_contratado',
  'valor_unitario_contratado',
  'Este produto está sem estoque.',
]);

assertContains('src/components/client/ClientAssinaturas.tsx', [
  "'pendente'",
  "'pago'",
  'nome_assinatura_contratada',
  'valor_mensal_contratado',
  'Cobranças futuras não pagas serão canceladas',
]);

assertContains('src/components/client/store/StoreItemCard.tsx', [
  'role="link"',
  'bg-[#17345f]',
  'Últimas {item.estoque_disponivel} unidades',
  "{isOutOfStock ? 'Indisponível' : 'Adicionar'}",
  'loading="lazy"',
]);
assertNotContains('src/components/client/store/StoreItemCard.tsx', [
  'animate-bounce',
  'animate-pulse',
  'from-indigo-600 to-purple-700',
]);

assertContains('src/components/client/store/FilterModal.tsx', [
  'Encontre com mais facilidade',
  'aria-pressed={selected}',
  'aria-invalid={hasInvalidRange}',
  'Aplicar filtros',
  'O preço máximo precisa ser igual ou maior que o preço mínimo.',
]);

assertContains('src/components/client/store/CheckoutPage.tsx', [
  'visivel_na_loja',
  'estoque_disponivel',
  'Remova os produtos excluídos ou esgotados do carrinho antes de finalizar.',
  'gsa_client_checkout_store',
  'request_id: checkoutRequestId.current',
]);

assertContains('src/types.ts', [
  "tipo_cliente: 'pf' | 'pj' | 'ambos';",
]);

assertContains('supabase/migrations/20260721010000_harden_products_and_subscriptions.sql', [
  'gsa_admin_operation_requests',
  'gsa_admin_adjust_product_stock',
  'gsa_admin_transition_store_order',
  'gsa_admin_cancel_store_order',
  'gsa_admin_activate_subscription',
  'gsa_process_due_subscription_cancellations',
  'valor_unitario_contratado',
  'valor_mensal_contratado',
]);

assertContains('supabase/migrations/20260721010100_secure_product_subscription_catalog.sql', [
  'gsa_admin_save_product_catalog',
  'gsa_admin_save_subscription_catalog',
  'gsa_admin_archive_catalog_items',
]);

assertContains('supabase/migrations/20260721100000_fix_products_subscriptions_runtime.sql', [
  'gsa_sync_admin_operation_request_columns',
  'actor_type = ator_tipo',
  'operation = operacao',
  'NEW.result := COALESCE(NEW.result, NEW.resultado)',
  'NEW.result IS DISTINCT FROM NEW.resultado',
  'gsa_admin_validate_context',
  'pg_advisory_xact_lock',
  'gsa_validate_product_catalog_row',
  'gsa_validate_subscription_catalog_row',
  'A assinatura ainda não possui pagamento confirmado',
]);

assertContains('supabase/migrations/20260721100100_fix_admin_session_token_hash.sql', [
  'public.gsa_hash_session_token(p_session_token)',
  'extensions.crypt',
  'extensions.digest',
]);

console.log('Contratos de Produtos e Assinaturas validados.');

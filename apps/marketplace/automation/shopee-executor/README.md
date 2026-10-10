# Executor Shopee assistido

Este programa roda no computador confiável. A VPS continua responsável pelo
banco, pagamentos, fila, auditoria e WhatsApp.

## Segurança operacional

- Usa um perfil Chrome dedicado, separado do seu navegador pessoal.
- A credencial do executor não contém a senha da Shopee.
- Não clica em **Comprar agora**, **Fazer pedido** ou **Pagar**.
- Processa um cliente por vez para não misturar o carrinho compartilhado.
- Endereço e documento não são gravados em logs locais.

## Configuração

1. No GSA HUB, abra **Vendas > Operação Shopee**.
2. Gere uma credencial para este computador.
3. Copie `.env.example` para `.env.local` e preencha a credencial.
4. Execute `npm run shopee:setup` e faça login manualmente na Shopee.
5. Feche o setup e execute `npm run shopee:executor`.

O primeiro piloto é assistido: o programa abre cada produto e informa a
variação e a quantidade. Você confere e adiciona ao carrinho. Ao final, o
programa registra que o pedido está aguardando pagamento humano.


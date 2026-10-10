# GSA HUB 3.0 — rebuild isolado com Supabase

Este diretório é uma cópia de trabalho separada do painel atual. Nada aqui é
publicado automaticamente e nenhuma alteração deve ser aplicada ao projeto
GSA HUB 3.0 existente.

## O que já está preparado

- Cópia da interface e dos fluxos do painel de Serviços.
- Fundação PostgreSQL para clientes, perfis, propostas, contratos, ordens,
  solicitações/documentos, financeiro, suporte, notificações, tarefas e auditoria.
- RLS habilitado nas tabelas da aplicação, com acesso do cliente limitado ao
  próprio cadastro e leitura das próprias operações.
- Bucket privado `gsa3-private`, com limite inicial de 15 MiB e políticas para
  upload/leitura por cliente autenticado dentro da própria pasta.
- Cliente Supabase de navegador configurado somente para URL e chave pública.
- Plano de conversão funcional por etapas em `docs/PORTING_PLAN.md`.

## Estado importante

Esta é a fundação segura da nova cópia, ainda não uma versão pronta para uso ou
produção. A interface herdada ainda chama a API Express/SQLite. Os módulos devem
ser conectados ao Supabase por etapas, substituindo chamadas da API e garantindo
as transições de negócio em RPCs/Edge Functions. Pagamentos, assinatura Gov.br,
e-mail e outras integrações com segredos continuam no servidor; chaves secretas
nunca devem ser colocadas em variáveis `VITE_*`.

Não existe projeto Supabase conectado nesta cópia ainda. Por isso a migration
não foi aplicada a nenhuma base remota e nenhum dado real foi copiado.

## Configuração local

1. Crie um projeto Supabase exclusivo para esta nova versão, sem reutilizar o
   projeto do painel antigo.
2. Copie `.env.example` para `.env.local` e preencha a URL e a chave pública do
   projeto novo.
3. Aplique `supabase/migrations/20261008000100_gsa3_supabase_foundation.sql`
   primeiro em uma base descartável/de desenvolvimento e revise as políticas.
4. Só depois de concluir a implementação de Auth, perfis e provisionamento de
   clientes, conecte os módulos da interface e faça os testes de autorização.

## Autenticação e provisionamento

O cadastro público está desativado no `config.toml`. Os usuários deverão ser
criados por fluxo administrativo controlado ou convite. Cada usuário Auth precisa
de um perfil em `gsa_profiles`; clientes também precisam estar vinculados a um
registro em `gsa_clients`. Não crie usuários de produção de teste com senhas
fracas nem compartilhe chaves de serviço.

## Comandos

- `npm run build` — valida TypeScript e gera build de desenvolvimento.
- `npm test` — testes automatizados herdados do protótipo local; não exercitam
  ainda o Supabase nem substituem testes de políticas RLS.

Não use os arquivos de `deploy/` herdados como instrução de publicação desta
cópia. A publicação Supabase deve receber um fluxo próprio, com ambiente de
staging, migrações revisadas e rollback documentado.

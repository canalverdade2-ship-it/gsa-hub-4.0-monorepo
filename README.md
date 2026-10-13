# GSA HUB 4.0 - Monorepo

Workspace consolidado do site público, Marketplace, painéis Supabase e portal legado.

As fontes originais permanecem intactas nas pastas anteriores até a migração ser validada.

Aplicações:
- apps/public-site
- apps/marketplace
- apps/admin-supabase
- apps/client-supabase
- apps/portal-legado


## Estado atual

- Estrutura criada sem apagar as origens.
- Dependências instaladas com pnpm.
- pnpm -r build aprovado nos cinco apps.
- O Marketplace está sem o módulo de empréstimos e usa exclusivamente o armazenamento local da VPS/Supabase.


## Estado da limpeza técnica — 09/10/2026

- O módulo de empréstimos foi retirado das rotas, menus, painéis, relatórios e componentes ativos do Marketplace.
- Os artefatos de armazenamento ativos usam a camada Supabase Storage; referências antigas ficam apenas em backups/scratch históricos e scripts de webhook legados, que não entram no build Vite.
- O armazenamento visual é apresentado como `Supabase Storage` local na VPS.
- As fontes `apps/marketplace` e `apps/public-site` estão sincronizadas.
- Build validado anteriormente para os cinco aplicativos; após a última remoção, o build do Marketplace foi validado novamente com sucesso (4477 módulos).

### Estado de produção

- Código, tipos, builds, testes e auditorias locais estão aprovados.
- Migrations históricas e snapshots permanecem arquivados para preservar rastreabilidade; não fazem parte do código executável.
- A API publicada em `https://api.147-15-43-141.nip.io` responde em 200 nos endpoints raiz, REST e Auth.
- O site público foi publicado em `https://api.147-15-43-141.nip.io/`.
- O painel Supabase foi publicado em `https://api.147-15-43-141.nip.io/gsa3-supabase/`.
- Os bundles publicados foram verificados externamente: não contêm referências a empréstimos nem a provedores de armazenamento externo.


## Inicialização limpa de produção

A auditoria encontrou dados antigos ativos na VPS: 14 usuários Auth, 1 cliente, 207 notificações, 3 objetos Storage, o SQLite legado e bancos de restauração. O procedimento protegido em `infra/reset-production-data.sh` está pronto, mas exige a confirmação explícita `WIPE_CONFIRM=GSA-HUB-NEW-PRODUCTION` antes de apagar esses dados.

## Saneamento final da árvore

- Snapshots, dumps, scripts de diagnóstico e artefatos de deploy antigos foram movidos para os diretórios de arquivo correspondentes.
- A árvore executável de cada app ficou restrita a código, configuração, assets e dependências do próprio app.
- Os adapters de Edge Functions foram renomeados para `storage.ts` e usam diretamente a API do Supabase Storage na VPS.
- O verificador `pnpm audit:monorepo` confirma que não existem referências ativas a provedores externos de armazenamento no código executável.
- Última validação: `pnpm build:all`, `pnpm test:all`, `pnpm lint:all` e `pnpm audit:all` concluídos sem erro.

Os comandos principais da raiz são:

```bash
pnpm build:all
pnpm audit:all
```

`pnpm audit:all` é o gate de armazenamento e impede regressão para provedores externos no código executável.

## Validação adicional

- Testes históricos que cobriam empréstimos foram retirados do conjunto ativo e preservados em `archive/legacy-loan-tests`.
- `tsc --noEmit` passou individualmente em `apps/marketplace` e `apps/public-site` após a limpeza.
- Correções de tipagem pública foram aplicadas para as rotas `ads`/`advertise`, login restrito e adaptador de imagens do Storage.

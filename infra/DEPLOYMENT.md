# Publicação da raiz consolidada

A raiz publicada é `GSA HUB 4.0 - Monorepo`. Cada aplicativo gera seu próprio `dist/`:

- `apps/public-site/dist` — site público e fluxos compartilhados
- `apps/marketplace/dist` — marketplace e painéis administrativos/cliente
- `apps/admin-supabase/dist` — painel administrativo Supabase direto
- `apps/client-supabase/dist` — painel do cliente Supabase direto
- `apps/portal-legado/dist` — portal legado preservado

## Pré-publicação

```bash
pnpm install --frozen-lockfile
pnpm build:all
pnpm test:all
pnpm lint:all
pnpm audit:all
```

As variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` devem ser fornecidas por ambiente. Arquivos `.env*` locais são ignorados pelo Git; apenas `.env.example` é referência versionável.

## Backend

O backend único é a instância Supabase self-hosted da VPS. As quatro migrations canônicas estão em `supabase/migrations`; históricos e snapshots ficam em `archive/` e não são carregados automaticamente.

## Smoke test externo

Após copiar os `dist/` para a VPS, confirmar no navegador:

1. carregamento do site público;
2. login do cliente e do administrador;
3. leitura e gravação de um registro de teste;
4. upload/download pelo Supabase Storage;
5. abertura dos painéis em viewport móvel;
6. ausência de chamadas para provedores externos de armazenamento ou para o backend antigo.

'# Fluxo durante a viagem

O GitHub privado `canalverdade2-ship-it/gsa-hub-4.0-monorepo` é a fonte do código. A VPS mantém um clone em `/var/www/gsa-hub/source`.

## Atualizar na VPS

```bash
cd /var/www/gsa-hub/source
bash infra/vps-sync.sh
```

O script baixa somente commits da branch `main`, instala o lockfile, cria os builds e executa testes, lint e auditoria. Ele não contém credenciais.

## Enviar alterações feitas na VPS

```bash
cd /var/www/gsa-hub/source
git add <arquivos-alterados>
git commit -m "descreva a alteração"
git push origin main
```

## Continuar no computador ao voltar

```bash
git pull --ff-only origin main
```

`.env`, chaves Supabase, tokens e chaves SSH ficam somente na VPS e nunca devem ser commitados.
'
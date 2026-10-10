# Publicação do GSA HUB 3.0 na VPS

A configuração prevista é: Nginx termina HTTPS e entrega `dist/`; apenas `/api` é encaminhado para o Node em `127.0.0.1:4180`; o SQLite e os uploads ficam em `/var/lib/gsa-hub/data`.

No host Oracle informado, o domínio `api.147-15-43-141.nip.io` já atende
Supabase e outros serviços. Para preservar essas rotas, o GSA HUB 3.0 é
publicado em `https://api.147-15-43-141.nip.io/gsa3/`. Nesse caso, gere o
frontend com `GSA_PUBLIC_BASE_PATH=/gsa3/ npm run build` e encaminhe apenas
`/api/` para o serviço Node do GSA HUB.

## Dados necessários antes do envio

- IP ou hostname da VPS e usuário SSH com `sudo`;
- distribuição e versão do Linux (Ubuntu 22.04/24.04 é o caminho esperado pelos arquivos abaixo);
- domínio que apontará para a VPS;
- decisão sobre preservar o banco local atual ou iniciar uma base limpa;
- valores de produção da InfinitePay e demais integrações, sempre preenchidos diretamente no servidor.

## Preparação no servidor

Instale Nginx e ferramentas básicas. A unidade fornecida usa o Node 24 isolado em
`/opt/node24/bin/node`, sem alterar o Node global usado pelos serviços existentes.
Se esse caminho for alterado na VPS, ajuste `ExecStart` em
`/etc/systemd/system/gsa-hub.service` antes de iniciar.

Crie o usuário e os diretórios:

```bash
sudo adduser --system --group --home /var/www/gsa-hub gsa-hub
sudo mkdir -p /var/www/gsa-hub /var/lib/gsa-hub/data /etc/gsa-hub
sudo chown -R gsa-hub:gsa-hub /var/www/gsa-hub /var/lib/gsa-hub
```

Envie o código para `/var/www/gsa-hub`, sem `node_modules/`, `.env.local`, arquivos de desenvolvimento e artefatos de captura. Depois, no servidor:

```bash
cd /var/www/gsa-hub
sudo -u gsa-hub npm ci
sudo -u gsa-hub env GSA_PUBLIC_BASE_PATH=/gsa3/ npm run build
```

O arquivo de ambiente contém a configuração inicial. A tela administrativa de
configuração da InfinitePay persiste alterações em
`/var/lib/gsa-hub/gsa-hub.runtime.env`, que permanece fora do diretório do código.
Não versionar nem enviar esse arquivo para fora da VPS.

Em `NODE_ENV=production`, o banco novo não recebe os usuários e dados demo do
desenvolvimento. Preencha `GSA_BOOTSTRAP_ADMIN_NAME`,
`GSA_BOOTSTRAP_ADMIN_EMAIL` e `GSA_BOOTSTRAP_ADMIN_PASSWORD` antes do primeiro
início; a senha precisa ter pelo menos 10 caracteres. Esses valores são usados
somente quando o banco ainda não possui a migração inicial.

O código atual usa SQLite (`server/store.mjs`) e guarda o banco em
`GSA_DATA_DIR`. Os documentos antigos do projeto citam PostgreSQL/Supabase como
arquitetura de referência, mas não há adaptador PostgreSQL nesta versão. O
procedimento abaixo publica a implementação SQLite atual; migrar para o banco
existente da VPS é uma etapa separada e não deve ser presumida durante o upload.

Copie `gsa-hub.env.example` para `/etc/gsa-hub/gsa-hub.env`, substitua o domínio e os segredos, e proteja o arquivo:

```bash
sudo chmod 600 /etc/gsa-hub/gsa-hub.env
sudo chown root:gsa-hub /etc/gsa-hub/gsa-hub.env
```

Se os dados atuais forem preservados, pare o servidor local antes de copiar `data/gsa3.sqlite` e `data/uploads/` para `/var/lib/gsa-hub/data/`. Não copie um SQLite em uso com os arquivos WAL/SHM ativos.

## Serviço e Nginx

```bash
sudo cp deploy/gsa-hub.service /etc/systemd/system/gsa-hub.service
sudo systemctl daemon-reload
sudo systemctl enable --now gsa-hub
curl http://127.0.0.1:4180/api/health
```

Edite `nginx-gsa-hub.conf`, trocando `app.example.com` pelo domínio real, e habilite-o:

```bash
sudo cp deploy/nginx-gsa-hub.conf /etc/nginx/sites-available/gsa-hub
sudo ln -s /etc/nginx/sites-available/gsa-hub /etc/nginx/sites-enabled/gsa-hub
sudo nginx -t
sudo systemctl reload nginx
```

Depois de o DNS apontar para a VPS, configure o certificado TLS com Certbot e teste o acesso por HTTPS. A porta 4180 deve permanecer fechada no firewall; somente 22, 80 e 443 devem ficar expostas conforme a política da VPS.

No host que já possui um `nginx.conf` com outros serviços, não substitua o
arquivo inteiro. Faça backup, insira as localizações de
`deploy/nginx-gsa3-locations.conf` dentro do server TLS de
`api.147-15-43-141.nip.io`, execute `nginx -t` e só então recarregue o Nginx.

## Verificação pós-publicação

1. Abrir o domínio em janela anônima e confirmar o login.
2. Testar os dois perfis, notificações, suporte com anexos, propostas, contratos e faturas.
3. Confirmar que uploads persistem após reiniciar o serviço.
4. Conferir `sudo journalctl -u gsa-hub -f` e os logs do Nginx.
5. Configurar backup diário de `/var/lib/gsa-hub/data/` antes de receber dados reais.

O repositório também inclui `gsa-hub-backup.service` e `gsa-hub-backup.timer`.
Eles criam uma cópia SQLite consistente com `VACUUM INTO` em
`/var/backups/gsa-hub`, mantendo as 14 cópias mais recentes. A instalação no
servidor deve ser feita depois de criar o diretório com proprietário
`gsa-hub:gsa-hub`:

```bash
sudo install -d -o gsa-hub -g gsa-hub -m 0750 /var/backups/gsa-hub
sudo install -o root -g gsa-hub -m 0750 deploy/gsa-hub-backup.mjs /usr/local/lib/gsa-hub/gsa-hub-backup.mjs
sudo install -o root -g root -m 0644 deploy/gsa-hub-backup.service deploy/gsa-hub-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gsa-hub-backup.timer
sudo systemctl start gsa-hub-backup.service
```

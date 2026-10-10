# Relatório de validação externa — GSA HUB 3.0

Data: 07/10/2026  
Ambiente: VPS de produção `https://api.147-15-43-141.nip.io/gsa3/`  
Banco validado: SQLite em `/var/lib/gsa-hub/data/gsa3.sqlite`

## Cobertura executada

- Painel administrativo: 15 rotas principais abertas diretamente pelo navegador em viewport móvel de 360×800.
- Painel do cliente: 10 módulos abertos diretamente pelo navegador em viewport móvel de 360×800.
- Todas as rotas verificadas terminaram sem rolagem horizontal (`scrollWidth` igual à largura da viewport) e sem mensagens visíveis de `NaN`, `undefined` ou erro inesperado.
- Cadastro de cliente PJ validado com CEP: consulta real preencheu logradouro, bairro, cidade e UF; o cadastro persistiu e abriu a tela 360°.
- Formulário de cliente PF/PJ, validação de campos obrigatórios, filtros da lista e navegação do resumo 360° verificados.
- Login do cliente validado com cinco primeiros dígitos do CNPJ, sem campo de senha.
- Suporte validado nos dois painéis: abertura, mensagem inicial, upload, visualização, download, resposta administrativa e status Aberto → Em atendimento → Resolvido.
- Notificações validadas: contador na bolinha, notificações geradas nos dois lados, mural, direcionamento para o ticket e redução do contador ao abrir a notificação.
- Isolamento validado com dois clientes temporários: cada sessão exibiu somente o próprio cadastro; o segundo cliente não abriu o ticket do primeiro por URL direta.
- Área administrativa bloqueada para sessão de cliente e endpoints protegidos redirecionaram para login sem expor conteúdo sensível.

## Segurança e dados

- Acesso sem sessão a `/api/state`, `/api/client-state`, `/api/admin/users` e `/api/clients` foi bloqueado pelo navegador.
- O HTML servido em produção não continha senha, service role, chaves de integração, token, segredo ou chave SSH; também não há source map publicado no `dist`.
- O banco final ficou com somente o administrador original, sem usuários, clientes, tickets, anexos ou registros dos testes.
- A senha original do administrador foi restaurada e verificada por hash no banco. Nenhuma credencial foi registrada neste relatório.
- Não foram executadas cobranças reais nem transações financeiras externas.

## Correção aplicada durante a validação

Foi encontrado e corrigido um risco de integridade no SQLite: IDs de tipos diferentes compartilhavam uma chave primária global, permitindo que uma pasta sobrescrevesse um cliente com o mesmo ID. O esquema foi migrado para a chave composta `(kind, id)`, o `UPSERT` foi corrigido e o cadastro foi repetido no navegador com sucesso.

## Verificações de código

- Suíte automatizada: 11/11 testes aprovados.
- TypeScript e build de produção: aprovados.
- O build emite apenas o aviso de bundle JavaScript acima de 500 kB; não houve erro de compilação.
- Serviço `gsa-hub`: ativo; healthcheck HTTP: 200; logs recentes sem erros de inicialização, SQLite ou porta.

## Limite da validação

O fluxo de pagamento não foi confirmado com uma cobrança real para evitar débito externo. Os módulos e estados financeiros foram abertos e verificados no navegador, mas a autorização de uma transação real precisa ser feita em uma janela específica de produção.

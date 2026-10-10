# Assinatura digital Gov.br

O fluxo direto da API oficial de Assinatura Eletrônica Gov.br permanece preparado no servidor, mas a interface atual usa o endereço de assinatura configurado no contrato — e, na ausência dele, o endereço Gov.br fornecido para o botão **Assinar digitalmente**. O navegador recebe apenas esse endereço; `client_secret`, token e o hash do documento permanecem no servidor quando a integração direta estiver habilitada.

## Configuração

Copie os campos de Gov.br do `.env.example` para o `.env.local` do servidor e preencha-os com as credenciais de homologação ou produção emitidas pelo Gov.br:

```dotenv
GOVBR_SIGNATURE_CLIENT_ID=
GOVBR_SIGNATURE_CLIENT_SECRET=
GOVBR_SIGNATURE_REDIRECT_URI=https://seu-dominio-oficial.gov.br/api/govbr/signature/callback
GOVBR_SIGNATURE_AUTHORIZE_URL=https://cas.staging.iti.br/oauth2.0/authorize
GOVBR_SIGNATURE_TOKEN_URL=https://cas.staging.iti.br/oauth2.0/token
GOVBR_SIGNATURE_API_BASE_URL=https://assinatura-api.staging.iti.br
GOVBR_SIGNATURE_SCOPE=sign govbr
```

A URL de retorno deve ser cadastrada exatamente igual no processo de integração. Para produção, o órgão precisa concluir a integração do Login Único e hospedar o sistema em domínio oficial elegível. As credenciais devem ser solicitadas pelo gestor público no serviço de integração do Gov.br.

Se a GSA HUB estiver operando como empresa privada em domínio comum, sem vínculo com um órgão público elegível, o credenciamento da API oficial não poderá ser concluído; nesse cenário será necessário contratar um provedor de assinatura compatível com empresas privadas.

## Fluxo implementado

1. O cliente clica em **Assinar digitalmente**.
2. O servidor gera `state` e `nonce` de uso único e redireciona o cliente para o Login Único.
3. O callback troca o `code` por um access token no servidor.
4. O servidor obtém o certificado público Gov.br associado à autorização.
5. O servidor calcula o SHA-256 do PDF do contrato e envia `hashBase64` para `assinarPKCS7`.
6. O retorno binário PKCS#7 é salvo como `.p7s`, junto do PDF original, caracterizando assinatura destacada (detached).
7. O contrato é atualizado para **Assinado**, com data, método, algoritmo e arquivos relacionados; o painel administrativo recebe uma notificação.

A assinatura destacada exige os dois arquivos, PDF e `.p7s`, para validação. A aplicação já persiste ambos; a etapa seguinte de produto pode expor os dois downloads no detalhe do contrato.

## Requisitos do Gov.br

O escopo `sign` autoriza uma assinatura por token e o escopo `signature_session` é reservado para lotes. O usuário precisa de conta Gov.br prata ou ouro; a conta bronze não pode assinar. A integração de produção também exige Login Único, URL de retorno cadastrada e homologação do fluxo.


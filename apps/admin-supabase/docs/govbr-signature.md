# Assinatura Gov.br nas Supabase Edge Functions

O início da assinatura é autorizado pela sessão Supabase do cliente. O callback OAuth retorna diretamente para a função `govbr-signature`, que troca o código, assina o hash SHA-256 do PDF no provedor Gov.br e guarda o arquivo `.p7s` privado no Supabase Storage. O navegador não recebe `client_secret` nem tokens do provedor.

Cadastre a URL de retorno exata no provedor e no secret `GOVBR_SIGNATURE_REDIRECT_URI`:

```text
https://SEU_PROJECT_REF.supabase.co/functions/v1/govbr-signature
```

Defina no projeto Supabase os secrets `GOVBR_SIGNATURE_CLIENT_ID`, `GOVBR_SIGNATURE_CLIENT_SECRET`, `GOVBR_SIGNATURE_REDIRECT_URI`, `GOVBR_SIGNATURE_AUTHORIZE_URL`, `GOVBR_SIGNATURE_TOKEN_URL`, `GOVBR_SIGNATURE_API_BASE_URL`, `GOVBR_SIGNATURE_SCOPE`, `APP_ORIGIN` e `CLIENT_CONTRACTS_URL`. Os valores de homologação precisam corresponder à aplicação Gov.br habilitada. Para produção, use os endpoints e credenciais de produção emitidos para a entidade elegível.

Antes de redirecionar ao Gov.br, o sistema garante que o contrato do cliente tem um PDF privado no Storage. A função usa estado de uso único com expiração de dez minutos, confirma que o contrato pertence ao usuário autenticado e mantém o PDF original e a assinatura destacada juntos. Uma resposta de erro ou indisponibilidade do provedor não marca o contrato como assinado.

Esta integração depende de credenciais, homologação e autorização do Gov.br. Sem elas, a operação retorna indisponibilidade configurável; os demais módulos do sistema não dependem da assinatura digital.

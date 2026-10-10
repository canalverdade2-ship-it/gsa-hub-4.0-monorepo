# Plano de conversão funcional para Supabase

## Situação da cópia

O frontend preservado ainda conversa com `server/index.mjs` por `src/api.ts`.
Esse servidor continua usando SQLite e arquivos locais. A migration Supabase é
uma fundação de destino; até a troca dos módulos abaixo, esta cópia **não deve
ser apresentada como sistema Supabase funcional**.

O backend existente possui dezenas de rotas e centenas de chamadas ao repositório
SQLite. A migração deve manter os fluxos de negócio e trocar os adaptadores de
persistência de forma explícita, com paridade de comportamento por módulo.

## Blocos de conversão

1. **Identidade e sessão:** criar o fluxo de autenticação Supabase para admin e
   cliente; provisionar `gsa_profiles`; mapear IDs antigos para UUIDs; preservar
   PF/PJ e validar papéis no servidor e em RLS. O login curto por prefixo do CPF/
   CNPJ não deve ser carregado como único fator de autenticação.
2. **Estado inicial e cadastro:** substituir `/state`, `/client-state`, `/me`,
   gestão de clientes, catálogo de serviços e usuários administrativos por
   consultas tipadas; preservar permissões por módulo.
3. **Comercial e operação:** propostas (rascunho, revisão, aceite e PDF),
   contratos (criação, vínculo, status e assinatura), ordens e etapas. Manter
   transações atômicas em RPCs para gerar códigos e converter proposta em
   contrato sem duplicidade.
4. **Documentos e anexos:** migrar upload de disco para `gsa3-private`; gravar
   metadados apenas depois do upload; exibir/baixar com URL assinada de curta
   duração; manter estados de envio e análise e validar tamanho/MIME no servidor.
5. **Financeiro e pagamentos:** clientes, faturas, parcelas, carteira e histórico
   em tabelas/RPCs; InfinitePay, webhook e credenciais permanecem em Edge
   Functions ou backend seguro. Não expor segredo no navegador.
6. **Atendimento:** tickets, mensagens e anexos; RLS por cliente e equipe;
   preservar notificações de envio e leitura.
7. **Administração:** tarefas, calendário, configurações da empresa, usuários,
   relatórios, solicitações de exclusão e trilhas de auditoria.
8. **Tempo real e alertas:** publicar somente eventos necessários; contar e
   marcar notificações com operações limitadas, sem baixar eventos de outros
   clientes para filtrar no navegador.

## Estratégia de dados

- Manter o painel atual e sua base sem escrita por esta cópia.
- Criar projeto Supabase separado para desenvolvimento/staging.
- Criar tabela de correspondência entre IDs legados e novos UUIDs antes de
  importar dados; preservar os IDs antigos como `legacy_id`.
- Migrar primeiro dados de demonstração/sanitizados e conferir contagens,
  relações, status e arquivos.
- Fazer importação produtiva somente após ensaio repetível, cópia de segurança,
  validação de amostras e janela de corte definida.
- `gsa_legacy_records` é área temporária para entidades ainda não modeladas; não
  deve virar substituto permanente para as tabelas de domínio.

## Segurança e validação exigidas

- Testar políticas RLS anon/authenticated/admin/client, com casos permitidos e
  negados para cada tabela e bucket.
- Verificar acesso cruzado a IDs de outros clientes em URL, filtros, RPCs,
  arquivos, tickets e notificações.
- Criar o perfil administrativo inicial por provisionamento controlado; nunca
  habilitar cadastro público de admin.
- Usar somente a chave pública no navegador. Service role e chaves de pagamento
  ficam em segredo de servidor.
- Testar upload inválido, arquivo acima do limite, URL expirada, cliente errado,
  retry após falha e remoção consistente do objeto/metadado.
- Testar fluxos financeiros com ambiente sandbox e validar assinatura de
  webhook antes de registrar pagamento.
- Fazer build e testes automatizados; testes de navegador só quando solicitados
  pelo usuário.

## Critério para considerar a migração pronta

Cada bloco só é concluído quando o módulo não usa mais o SQLite, seus fluxos
principais passaram por teste automatizado, os testes RLS negam acesso indevido,
os dados importados conferem e há plano de retorno. Só então o backend legado
pode ser removido **desta cópia**. A aplicação atual e sua publicação continuam
fora do escopo.

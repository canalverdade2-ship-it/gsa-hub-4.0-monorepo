-- ============================================================
-- SEED DETERMINÍSTICO GSA HUB — Remediação de Cobertura
-- Versão: 2.0 — 2026-09-16
-- Identidades: cliente, admin, prestador, fornecedor, afiliado, parceiro
-- ISOLAMENTO: APENAS para banco local (supabase start)
-- PROIBIDO: dados de produção, CPFs reais, UUIDs de produção
-- ============================================================

-- Limpar dados de teste anteriores (ordem inversa de FK)
TRUNCATE TABLE public.prestador_agendamentos CASCADE;
TRUNCATE TABLE public.prestador_demandas CASCADE;
TRUNCATE TABLE public.prestador_transacoes CASCADE;
TRUNCATE TABLE public.prestador_faturas CASCADE;
TRUNCATE TABLE public.prestador_saques CASCADE;
TRUNCATE TABLE public.prestador_documentos CASCADE;
TRUNCATE TABLE public.prestadores CASCADE;
TRUNCATE TABLE public.colaborador_modulos CASCADE;
TRUNCATE TABLE public.colaboradores CASCADE;
TRUNCATE TABLE public.pontos_movimentacoes CASCADE;
TRUNCATE TABLE public.carteira_lancamentos CASCADE;
TRUNCATE TABLE public.pagamentos CASCADE;
TRUNCATE TABLE public.faturas CASCADE;
TRUNCATE TABLE public.ordens_servico CASCADE;
TRUNCATE TABLE public.orcamentos CASCADE;
TRUNCATE TABLE public.vouchers CASCADE;
TRUNCATE TABLE public.promocoes CASCADE;
TRUNCATE TABLE public.assinaturas CASCADE;
TRUNCATE TABLE public.produtos CASCADE;
TRUNCATE TABLE public.servicos CASCADE;
TRUNCATE TABLE public.clientes CASCADE;
TRUNCATE TABLE public.indicacoes CASCADE;

-- ============================================================
-- AUTH.USERS — Identidades de Teste
-- ============================================================

INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
VALUES
  -- CLIENTE
  ('aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa',
   '00000000-0000-0000-0000-000000000000',
   'cliente_teste@gsa-local.test',
   crypt('PIN1234', gen_salt('bf')),
   now(),
   '{"provider":"cpf","providers":["cpf"]}',
   '{"cpf":"748.277.601-01","nome":"Cliente Teste Seed","role":"cliente"}',
   now(), now(), 'authenticated', 'authenticated'),

  -- ADMINISTRADOR
  ('bbbbbbbb-0002-0002-0002-bbbbbbbbbbbb',
   '00000000-0000-0000-0000-000000000000',
   'admin_teste@gsa-local.test',
   crypt('PIN5678', gen_salt('bf')),
   now(),
   '{"provider":"cpf","providers":["cpf"]}',
   '{"cpf":"290.932.090-79","nome":"Admin Teste Seed","role":"administrador"}',
   now(), now(), 'authenticated', 'authenticated'),

  -- PRESTADOR
  ('cccccccc-0003-0003-0003-cccccccccccc',
   '00000000-0000-0000-0000-000000000000',
   'prestador_teste@gsa-local.test',
   crypt('PIN9012', gen_salt('bf')),
   now(),
   '{"provider":"cpf","providers":["cpf"]}',
   '{"cpf":"838.218.370-00","nome":"Prestador Teste Seed","role":"prestador"}',
   now(), now(), 'authenticated', 'authenticated'),

  -- FORNECEDOR
  ('dddddddd-0004-0004-0004-dddddddddddd',
   '00000000-0000-0000-0000-000000000000',
   'fornecedor_teste@gsa-local.test',
   crypt('PIN3456', gen_salt('bf')),
   now(),
   '{"provider":"cnpj","providers":["cnpj"]}',
   '{"cnpj":"11.222.333/0001-81","nome":"Fornecedor Teste Seed","role":"fornecedor"}',
   now(), now(), 'authenticated', 'authenticated'),

  -- AFILIADO
  ('eeeeeeee-0005-0005-0005-eeeeeeeeeeee',
   '00000000-0000-0000-0000-000000000000',
   'afiliado_teste@gsa-local.test',
   crypt('PIN7890', gen_salt('bf')),
   now(),
   '{"provider":"cpf","providers":["cpf"]}',
   '{"cpf":"495.001.890-06","nome":"Afiliado Teste Seed","role":"afiliado"}',
   now(), now(), 'authenticated', 'authenticated'),

  -- PARCEIRO
  ('ffffffff-0006-0006-0006-ffffffffffff',
   '00000000-0000-0000-0000-000000000000',
   'parceiro_teste@gsa-local.test',
   crypt('PIN1122', gen_salt('bf')),
   now(),
   '{"provider":"cnpj","providers":["cnpj"]}',
   '{"cnpj":"22.333.444/0001-92","nome":"Parceiro Teste Seed","role":"parceiro"}',
   now(), now(), 'authenticated', 'authenticated')

ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  updated_at = now();

-- ============================================================
-- CLIENTES
-- ============================================================
INSERT INTO public.clientes (id, codigo_cliente, nome, email, cpf, tipo_pessoa, saldo_carteira, saldo_pontos, pontos_totais, status, created_at)
VALUES (
  'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa',
  'CLI-SEED-001',
  'Cliente Teste Seed',
  'cliente_teste@gsa-local.test',
  '74827760101',  -- CPF válido por Módulo 11, não pertence a nenhum usuário real
  'pf',
  250.00,
  1500,
  2000,
  'ativo',
  now()
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- COLABORADORES (Admin)
-- ============================================================
INSERT INTO public.colaboradores (id, nome, email, cpf, status, cargo, permissoes, created_at)
VALUES (
  'bbbbbbbb-0002-0002-0002-bbbbbbbbbbbb',
  'Admin Teste Seed',
  'admin_teste@gsa-local.test',
  '29093209079',  -- CPF válido por Módulo 11
  'ativo',
  'Gerente',
  '{"admin": true, "vendas": true, "relatorios": true}',
  now()
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PRESTADORES
-- ============================================================
INSERT INTO public.prestadores (id, nome, email, cpf, numero, status, especialidade, created_at)
VALUES (
  'cccccccc-0003-0003-0003-cccccccccccc',
  'Prestador Teste Seed',
  'prestador_teste@gsa-local.test',
  '83821837000',  -- CPF válido por Módulo 11
  '+5511999000001',
  'ativo',
  'Eletricista',
  now()
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- INDICAÇÕES (Afiliados)
-- ============================================================
INSERT INTO public.indicacoes (id, cliente_id, codigo_indicacao, total_indicados, total_convertidos, comissao_acumulada, status, created_at)
VALUES (
  'eeeeeeee-0005-0005-0005-000000000001',
  'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa',  -- cliente vinculado ao afiliado
  'AFIL-SEED-001',
  5,
  2,
  80.00,
  'ativo',
  now()
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SERVIÇOS
-- ============================================================
INSERT INTO public.servicos (id, nome, descricao, preco, status, categoria, created_at)
VALUES
  ('11111111-aaaa-aaaa-aaaa-111111111111', 'Instalação Elétrica', 'Instalação completa de circuitos', 350.00, 'ativo', 'Eletrica', now()),
  ('22222222-bbbb-bbbb-bbbb-222222222222', 'Pintura Residencial', 'Pintura interna e externa', 500.00, 'ativo', 'Pintura', now()),
  ('33333333-cccc-cccc-cccc-333333333333', 'Desentupimento', 'Desentupimento de ralos e canos', 200.00, 'ativo', 'Hidraulica', now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PRODUTOS (Loja)
-- ============================================================
INSERT INTO public.produtos (id, nome, descricao, preco, preco_original, estoque, status, categoria, created_at)
VALUES
  ('aaaa1111-prod-prod-prod-aaaaaaaaaaaa', 'Produto Seed A', 'Produto para testes E2E', 99.90, 149.90, 50, 'ativo', 'Eletronicos', now()),
  ('bbbb2222-prod-prod-prod-bbbbbbbbbbbb', 'Produto Seed B', 'Produto digital para testes', 49.90, 79.90, 100, 'ativo', 'Digital', now()),
  ('cccc3333-prod-prod-prod-cccccccccccc', 'Produto Seed C Sem Estoque', 'Produto para testar out-of-stock', 29.90, 39.90, 0, 'ativo', 'Acessorios', now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PROMOÇÕES / VOUCHERS
-- ============================================================
INSERT INTO public.promocoes (id, nome, descricao, desconto, tipo_desconto, status, data_inicio, data_fim, created_at)
VALUES (
  'promo111-1111-1111-1111-111111111111',
  'Desconto Seed 20%',
  'Promoção de teste para auditoria',
  20.00,
  'percentual',
  'ativa',
  now() - interval '1 day',
  now() + interval '30 days',
  now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.vouchers (id, codigo, desconto, tipo_desconto, status, usos_maximos, usos_realizados, data_validade, created_at)
VALUES (
  'voucher1-1111-1111-1111-111111111111',
  'SEED-VOUCHER-10',
  10.00,
  'percentual',
  'ativo',
  100,
  0,
  now() + interval '30 days',
  now()
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ORÇAMENTOS (para jornada E2E de OS)
-- ============================================================
INSERT INTO public.orcamentos (id, cliente_id, servico_id, titulo, descricao, valor_estimado, status, created_at)
VALUES (
  'orc00001-1111-1111-1111-111111111111',
  'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa',
  '11111111-aaaa-aaaa-aaaa-111111111111',
  'Instalação Elétrica Seed',
  'Orçamento de teste para jornada E2E-03',
  350.00,
  'pendente',
  now()
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ORDENS DE SERVIÇO (para jornada E2E-03: Cliente→Admin→Prestador)
-- ============================================================
INSERT INTO public.ordens_servico (id, cliente_id, prestador_id, orcamento_id, codigo_os, servico, descricao, status, valor, data_agendamento, created_at)
VALUES (
  'os000001-1111-1111-1111-111111111111',
  'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa',
  'cccccccc-0003-0003-0003-cccccccccccc',
  'orc00001-1111-1111-1111-111111111111',
  'OS-SEED-001',
  'Instalação Elétrica',
  'OS de teste para jornada E2E-03 (Cliente→Admin→Prestador)',
  'aberta',
  350.00,
  now() + interval '2 days',
  now()
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- AGENDAMENTOS DO PRESTADOR (para jornada E2E-06)
-- ============================================================
INSERT INTO public.prestador_agendamentos (id, prestador_id, cliente_id, os_id, data_hora, status, observacoes, created_at)
VALUES (
  'agend001-1111-1111-1111-111111111111',
  'cccccccc-0003-0003-0003-cccccccccccc',
  'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa',
  'os000001-1111-1111-1111-111111111111',
  now() + interval '2 days',
  'confirmado',
  'Agendamento de teste para jornada E2E',
  now()
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- FATURAS (para jornadas financeiras)
-- ============================================================
INSERT INTO public.faturas (id, cliente_id, numero_fatura, valor_total, status, data_vencimento, created_at)
VALUES (
  'fatura01-1111-1111-1111-111111111111',
  'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa',
  'FAT-SEED-001',
  99.90,
  'pendente',
  now() + interval '7 days',
  now()
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PONTOS/FIDELIDADE (para jornada E2E-04)
-- ============================================================
INSERT INTO public.pontos_movimentacoes (id, cliente_id, pontos, tipo, descricao, created_at)
VALUES
  ('pontos01-1111-1111-1111-111111111111', 'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa', 500, 'credito', 'Pontos iniciais seed', now()),
  ('pontos02-1111-1111-1111-111111111111', 'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa', 1000, 'credito', 'Pontos compra seed', now() - interval '5 days')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ASSINATURAS (para módulo financeiro)
-- ============================================================
INSERT INTO public.assinaturas (id, cliente_id, plano, valor_mensal, status, data_inicio, data_renovacao, created_at)
VALUES (
  'assina01-1111-1111-1111-111111111111',
  'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa',
  'basico',
  29.90,
  'ativa',
  now() - interval '30 days',
  now() + interval '30 days',
  now()
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- CARTEIRA / LANÇAMENTOS
-- ============================================================
INSERT INTO public.carteira_lancamentos (id, cliente_id, valor, tipo, descricao, created_at)
VALUES
  ('cartei01-1111-1111-1111-111111111111', 'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa', 100.00, 'credito', 'Crédito inicial seed', now() - interval '10 days'),
  ('cartei02-1111-1111-1111-111111111111', 'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa', 150.00, 'credito', 'Depósito seed', now() - interval '5 days'),
  ('cartei03-1111-1111-1111-111111111111', 'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa', -50.00, 'debito', 'Pagamento serviço seed', now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- VERIFICAÇÃO FINAL
-- ============================================================
DO $$
DECLARE
  v_clientes int;
  v_colaboradores int;
  v_prestadores int;
  v_servicos int;
  v_produtos int;
  v_os int;
BEGIN
  SELECT COUNT(*) INTO v_clientes FROM public.clientes;
  SELECT COUNT(*) INTO v_colaboradores FROM public.colaboradores;
  SELECT COUNT(*) INTO v_prestadores FROM public.prestadores;
  SELECT COUNT(*) INTO v_servicos FROM public.servicos;
  SELECT COUNT(*) INTO v_produtos FROM public.produtos;
  SELECT COUNT(*) INTO v_os FROM public.ordens_servico;

  RAISE NOTICE 'SEED VERIFICATION: clientes=%, colaboradores=%, prestadores=%, servicos=%, produtos=%, ordens_servico=%',
    v_clientes, v_colaboradores, v_prestadores, v_servicos, v_produtos, v_os;

  IF v_clientes < 1 OR v_colaboradores < 1 OR v_prestadores < 1 THEN
    RAISE EXCEPTION 'SEED FAILED: identidades insuficientes!';
  END IF;
END $$;

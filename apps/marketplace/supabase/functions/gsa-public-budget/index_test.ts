import { handleRequest, normalizePayload } from './index.ts';

const DEVELOPMENT_ORIGINS = 'http://localhost:3000,http://10.0.2.189:3000';

function assertEquals(actual: unknown, expected: unknown, message = 'Valores diferentes') {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}`);
  }
}

Deno.test('normaliza tipos de tecnologia e da jornada de marca', () => {
  const technology = normalizePayload({
    nome: 'Empresa de Teste',
    email: 'CONTATO@EXAMPLE.COM',
    telefone: '(11) 99999-9999',
    tipo: 'integracao',
    solicitacao: 'Precisamos integrar o sistema comercial ao atendimento existente.',
    website: '',
    started_at: new Date(Date.now() - 5_000).toISOString(),
    metadata: { utm_source: 'campanha' },
  });

  const branding = normalizePayload({
    nome: 'Nova Empresa',
    email: 'marca@example.com',
    telefone: '(11) 98888-7777',
    tipo: 'jornada_completa',
    solicitacao: 'Precisamos criar nome, logo, site, redes sociais e conteúdo de lançamento.',
    website: '',
    started_at: new Date(Date.now() - 5_000).toISOString(),
    metadata: { source: 'public_brand_journey' },
  });

  assertEquals(technology?.email, 'contato@example.com');
  assertEquals(technology?.telefone, '11999999999');
  assertEquals(technology?.tipo, 'integracao');
  assertEquals(branding?.tipo, 'jornada_completa');
  assertEquals(branding?.metadata.source, 'public_brand_journey');
});

Deno.test('normaliza e filtra anexos válidos no orçamento', () => {
  const withAttachments = normalizePayload({
    nome: 'Empresa com Anexo',
    email: 'anexo@example.com',
    telefone: '11999998888',
    tipo: 'site',
    solicitacao: 'Segue em anexo a apresentação da identidade e requisitos do site.',
    website: '',
    started_at: new Date(Date.now() - 5_000).toISOString(),
    anexos: [
      {
        nome: 'briefing.pdf',
        url: 'https://example.supabase.co/storage/v1/object/public/orcamentos-anexos/public/leads/briefing.pdf',
        tipo: 'application/pdf',
        tamanho: 102400,
      },
      {
        nome: 'malicioso.exe',
        url: 'http://inseguro.example.com/malicioso.exe', // Deve ignorar (não é https)
      },
    ],
  });

  assertEquals(withAttachments?.anexos?.length, 1);
  assertEquals(withAttachments?.anexos?.[0].nome, 'briefing.pdf');
  assertEquals(withAttachments?.anexos?.[0].tamanho, 102400);
});

Deno.test('rejeita payload inválido antes de acessar o banco', () => {
  assertEquals(normalizePayload({
    nome: 'A',
    email: 'invalido',
    telefone: '1',
    tipo: 'desconhecido',
    solicitacao: 'curta',
    started_at: '',
  }), null);
});

Deno.test('valida CORS permitido e bloqueado de forma sequencial', async () => {
  const previousOrigins = Deno.env.get('ALLOWED_ORIGINS');
  try {
    Deno.env.set('ALLOWED_ORIGINS', DEVELOPMENT_ORIGINS);

    const blocked = await handleRequest(new Request('https://example.test', {
      method: 'OPTIONS',
      headers: { origin: 'https://attacker.example' },
    }));
    assertEquals(blocked.status, 403, 'Origem externa deveria ser bloqueada');

    const allowed = await handleRequest(new Request('https://example.test', {
      method: 'OPTIONS',
      headers: { origin: 'http://10.0.2.189:3000' },
    }));
    assertEquals(allowed.status, 204, 'Origem de desenvolvimento deveria ser aceita');
    assertEquals(allowed.headers.get('access-control-allow-origin'), 'http://10.0.2.189:3000');
  } finally {
    if (previousOrigins === undefined) Deno.env.delete('ALLOWED_ORIGINS');
    else Deno.env.set('ALLOWED_ORIGINS', previousOrigins);
  }
});

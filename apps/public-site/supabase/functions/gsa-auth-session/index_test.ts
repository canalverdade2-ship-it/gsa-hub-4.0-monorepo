import { assertEquals } from 'jsr:@std/assert@1';
import { handleRequest, normalizePayload, subjectRateLimitMode } from './index.ts';

function withAllowedOrigins(value: string, callback: () => Promise<void>) {
  const previousOrigins = Deno.env.get('ALLOWED_ORIGINS');
  const previousOrigin = Deno.env.get('ALLOWED_ORIGIN');

  Deno.env.set('ALLOWED_ORIGINS', value);
  Deno.env.delete('ALLOWED_ORIGIN');

  return callback().finally(() => {
    if (previousOrigins === undefined) Deno.env.delete('ALLOWED_ORIGINS');
    else Deno.env.set('ALLOWED_ORIGINS', previousOrigins);

    if (previousOrigin === undefined) Deno.env.delete('ALLOWED_ORIGIN');
    else Deno.env.set('ALLOWED_ORIGIN', previousOrigin);
  });
}

Deno.test('normaliza somente documentos, PINs e tipos válidos', () => {
  assertEquals(
    normalizePayload('login_pin', {
      documento: '123.456.789-00',
      pin: '1234',
      tipo: 'cliente',
    }),
    { documento: '12345678900', pin: '1234', tipo: 'cliente' },
  );

  assertEquals(normalizePayload('login_pin', {
    documento: '123',
    pin: '12',
    tipo: 'cliente',
  }), null);
});

Deno.test('normaliza cadastro independente de afiliado', () => {
  assertEquals(normalizePayload('register_affiliate', {
    documento: '529.982.247-25',
    nome: 'Pessoa Afiliada',
    nome_divulgacao: 'Afiliado GSA',
    email: 'Afiliado@Example.com',
    telefone: '(11) 99999-0001',
    pin: '4826',
    pix_tipo: 'cpf',
    pix_chave: '529.982.247-25',
    termos_versao: '2026-08-29',
    termos_aceitos: true,
  }), {
    documento: '52998224725',
    nome: 'Pessoa Afiliada',
    nome_divulgacao: 'Afiliado GSA',
    email: 'afiliado@example.com',
    telefone: '11999990001',
    pin: '4826',
    pix_tipo: 'cpf',
    pix_chave: '529.982.247-25',
    termos_versao: '2026-08-29',
    termos_aceitos: 'true',
  });

  assertEquals(normalizePayload('register_affiliate', {
    documento: '529.982.247-25',
    nome: 'Pessoa Afiliada',
    nome_divulgacao: 'Afiliado GSA',
    email: 'invalido',
    telefone: '11999990001',
    pin: '4826',
    pix_tipo: 'cpf',
    pix_chave: '52998224725',
    termos_aceitos: true,
  }), null);
});

Deno.test('rejeita origem não autorizada antes de acessar o banco', async () => {
  await withAllowedOrigins('https://app.gsa.example', async () => {
    const response = await handleRequest(new Request('https://gateway.example', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example' },
    }));

    assertEquals(response.status, 403);
    assertEquals(await response.json(), { error: 'origin_not_allowed' });
    assertEquals(response.headers.get('access-control-allow-origin'), null);
    assertEquals(response.headers.get('access-control-allow-credentials'), null);
  });
});

Deno.test('autoriza preflight somente para origem configurada', async () => {
  await withAllowedOrigins('https://app.gsa.example, https://admin.gsa.example', async () => {
    const response = await handleRequest(new Request('https://gateway.example', {
      method: 'OPTIONS',
      headers: { origin: 'https://app.gsa.example' },
    }));

    assertEquals(response.status, 204);
    assertEquals(response.headers.get('access-control-allow-origin'), 'https://app.gsa.example');
    assertEquals(response.headers.get('access-control-allow-credentials'), 'true');
    assertEquals(response.headers.get('vary'), 'Origin');
  });
});

Deno.test('autoriza todas as origens locais usadas no desenvolvimento', async () => {
  const origins = [
    'http://10.0.2.189:3000',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];

  await withAllowedOrigins(origins.join(','), async () => {
    for (const origin of origins) {
      const response = await handleRequest(new Request('https://gateway.example', {
        method: 'OPTIONS',
        headers: { origin },
      }));

      assertEquals(response.status, 204);
      assertEquals(response.headers.get('access-control-allow-origin'), origin);
      assertEquals(response.headers.get('access-control-allow-credentials'), 'true');
    }
  });
});


Deno.test('normaliza recuperação somente com e-mail válido e desafio UUID', () => {
  assertEquals(normalizePayload('request_client_recovery', {
    documento: '123.456.789-00',
    email: 'Cliente@Example.com',
  }), { documento: '12345678900', email: 'cliente@example.com' });

  assertEquals(normalizePayload('complete_client_recovery', {
    recovery_id: '550e8400-e29b-41d4-a716-446655440000',
  }), { challenge_id: '550e8400-e29b-41d4-a716-446655440000' });

  assertEquals(normalizePayload('complete_client_recovery', { recovery_id: 'invalido' }), null);
});

Deno.test('aplica limite por identidade antes dos fluxos de recuperação', () => {
  assertEquals(subjectRateLimitMode('register_affiliate'), 'before');
  assertEquals(subjectRateLimitMode('request_client_first_access'), 'before');
  assertEquals(subjectRateLimitMode('complete_client_first_access'), 'before');
  assertEquals(subjectRateLimitMode('request_client_recovery'), 'before');
  assertEquals(subjectRateLimitMode('complete_client_recovery'), 'before');
  assertEquals(subjectRateLimitMode('login_pin'), 'invalid-only');
  assertEquals(subjectRateLimitMode('login_admin'), 'invalid-only');
});

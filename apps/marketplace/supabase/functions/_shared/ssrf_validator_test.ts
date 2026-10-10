import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  assertUrlResolvesPublic,
  isPublicIpAddress,
  isUrlSafe,
  type DnsResolver,
} from './ssrf_validator.ts';

Deno.test('bloqueia endereços IPv4 privados, reservados e metadados', () => {
  for (const address of [
    '127.0.0.1',
    '10.1.2.3',
    '100.64.1.2',
    '169.254.169.254',
    '172.20.1.2',
    '192.168.1.2',
    '198.51.100.2',
    '224.0.0.1',
  ]) {
    assertEquals(isPublicIpAddress(address), false, address);
    assertEquals(isUrlSafe(`http://${address}/produto`), false, address);
  }
  assert(isPublicIpAddress('8.8.8.8'));
});

Deno.test('bloqueia IPv6 local, reservado, mapeado e de documentação', () => {
  for (const address of ['::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '2001:db8::1']) {
    assertEquals(isPublicIpAddress(address), false, address);
    assertEquals(isUrlSafe(`http://[${address}]/produto`), false, address);
  }
  assert(isPublicIpAddress('2606:4700:4700::1111'));
});

Deno.test('rejeita quando qualquer resposta DNS aponta para rede privada', async () => {
  const mixedResolver: DnsResolver = async (_hostname, type) =>
    type === 'A' ? ['203.0.114.10'] : ['fd00::10'];

  await assertRejects(
    () => assertUrlResolvesPublic('https://store.example.net/item', mixedResolver),
    Error,
    'privada',
  );
});

Deno.test('aceita host quando todas as respostas DNS são públicas', async () => {
  const publicResolver: DnsResolver = async (_hostname, type) =>
    type === 'A' ? ['8.8.8.8'] : ['2606:4700:4700::1111'];

  const url = await assertUrlResolvesPublic('https://store.example.net/item', publicResolver);
  assertEquals(url.hostname, 'store.example.net');
});

export type DnsRecordType = 'A' | 'AAAA';
export type DnsResolver = (hostname: string, recordType: DnsRecordType) => Promise<string[]>;

const BLOCKED_HOST_SUFFIXES = [
  '.internal',
  '.local',
  '.localhost',
  '.home',
  '.lan',
  '.corp',
  '.test',
  '.invalid',
  '.example',
];

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

function parseIpv4(value: string): number[] | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return null;
  const octets = value.split('.').map(Number);
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    ? octets
    : null;
}

function ipv4Number(octets: number[]) {
  return (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256) + octets[3];
}

function isPublicIpv4(value: string) {
  const octets = parseIpv4(value);
  if (!octets) return false;
  const address = ipv4Number(octets);
  const ranges = [
    ['0.0.0.0', '0.255.255.255'],
    ['10.0.0.0', '10.255.255.255'],
    ['100.64.0.0', '100.127.255.255'],
    ['127.0.0.0', '127.255.255.255'],
    ['169.254.0.0', '169.254.255.255'],
    ['172.16.0.0', '172.31.255.255'],
    ['192.0.0.0', '192.0.0.255'],
    ['192.0.2.0', '192.0.2.255'],
    ['192.88.99.0', '192.88.99.255'],
    ['192.168.0.0', '192.168.255.255'],
    ['198.18.0.0', '198.19.255.255'],
    ['198.51.100.0', '198.51.100.255'],
    ['203.0.113.0', '203.0.113.255'],
    ['224.0.0.0', '255.255.255.255'],
  ] as const;
  return !ranges.some(([start, end]) => {
    const lower = ipv4Number(parseIpv4(start)!);
    const upper = ipv4Number(parseIpv4(end)!);
    return address >= lower && address <= upper;
  });
}

function parseIpv6(value: string): number[] | null {
  let normalized = normalizeHostname(value);
  if (!normalized.includes(':') || normalized.includes('%')) return null;

  const ipv4Match = normalized.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (ipv4Match) {
    const ipv4 = parseIpv4(ipv4Match[1]);
    if (!ipv4) return null;
    normalized = normalized.slice(0, -ipv4Match[1].length)
      + ((ipv4[0] << 8) | ipv4[1]).toString(16)
      + ':'
      + ((ipv4[2] << 8) | ipv4[3]).toString(16);
  }

  if ((normalized.match(/::/g) || []).length > 1) return null;
  const [leftRaw, rightRaw = ''] = normalized.split('::');
  const left = leftRaw ? leftRaw.split(':') : [];
  const right = rightRaw ? rightRaw.split(':') : [];
  if ([...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) return null;

  const missing = 8 - left.length - right.length;
  if ((normalized.includes('::') && missing < 1) || (!normalized.includes('::') && missing !== 0)) {
    return null;
  }
  const groups = [
    ...left,
    ...Array.from({ length: Math.max(0, missing) }, () => '0'),
    ...right,
  ].map((part) => Number.parseInt(part, 16));
  if (groups.length !== 8) return null;

  return groups.flatMap((group) => [group >> 8, group & 0xff]);
}

function hasPrefix(bytes: number[], prefix: number[]) {
  return prefix.every((value, index) => bytes[index] === value);
}

function isPublicIpv6(value: string) {
  const bytes = parseIpv6(value);
  if (!bytes) return false;

  // Public IPv6 unicast is currently allocated from 2000::/3. Keeping the
  // allowlist narrow also rejects loopback, link-local, ULA and multicast.
  if ((bytes[0] & 0xe0) !== 0x20) return false;
  if (hasPrefix(bytes, [0x20, 0x01, 0x0d, 0xb8])) return false; // documentation
  if (hasPrefix(bytes, [0x20, 0x01, 0x00, 0x00])) return false; // Teredo
  if (hasPrefix(bytes, [0x20, 0x02])) return false; // 6to4 / embedded IPv4
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && (bytes[2] & 0xf0) === 0x20) return false; // ORCHID
  return true;
}

export function isPublicIpAddress(value: string) {
  const normalized = normalizeHostname(value);
  if (parseIpv4(normalized)) return isPublicIpv4(normalized);
  if (parseIpv6(normalized)) return isPublicIpv6(normalized);
  return false;
}

function parseSafeUrl(urlValue: string): URL {
  const url = new URL(urlValue);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('URL inválida ou não permitida');
  }
  if (
    (url.protocol === 'http:' && url.port && url.port !== '80')
    || (url.protocol === 'https:' && url.port && url.port !== '443')
  ) {
    throw new Error('Porta de destino não permitida');
  }

  const hostname = normalizeHostname(url.hostname);
  if (
    !hostname
    || hostname === 'localhost'
    || (!hostname.includes('.') && !parseIpv6(hostname))
    || BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new Error('Host de destino não permitido');
  }
  if ((parseIpv4(hostname) || parseIpv6(hostname)) && !isPublicIpAddress(hostname)) {
    throw new Error('Endereço de rede privado ou reservado');
  }
  return url;
}

// Compatibilidade para validações sintáticas. A autorização de uma requisição
// de rede deve sempre usar assertUrlResolvesPublic, que também consulta DNS.
export function isUrlSafe(urlValue: string): boolean {
  try {
    parseSafeUrl(urlValue);
    return true;
  } catch {
    return false;
  }
}

const denoResolver: DnsResolver = (hostname, recordType) =>
  Deno.resolveDns(hostname, recordType) as Promise<string[]>;

export async function assertUrlResolvesPublic(
  urlValue: string,
  resolver: DnsResolver = denoResolver,
): Promise<URL> {
  const url = parseSafeUrl(urlValue);
  const hostname = normalizeHostname(url.hostname);
  if (parseIpv4(hostname) || parseIpv6(hostname)) return url;

  const lookups = await Promise.allSettled([
    resolver(hostname, 'A'),
    resolver(hostname, 'AAAA'),
  ]);
  const addresses = lookups.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  if (addresses.length === 0 || addresses.length > 32) {
    throw new Error('Não foi possível resolver o host de destino');
  }
  if (addresses.some((address) => !isPublicIpAddress(address))) {
    throw new Error('O host resolve para uma rede privada ou reservada');
  }
  return url;
}

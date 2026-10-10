function decodeReturnTo(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function sanitizeInternalReturnTo(
  value: string | null,
  allowedPrefixes: readonly string[],
): string | null {
  if (!value) return null;
  const decoded = decodeReturnTo(value);
  if (!decoded || !decoded.startsWith('/') || decoded.startsWith('//')) return null;

  let parsed: URL;
  try {
    parsed = new URL(decoded, 'https://gsa.local');
  } catch {
    return null;
  }

  if (parsed.origin !== 'https://gsa.local') return null;
  const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  const allowed = allowedPrefixes.some((prefix) => (
    parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`)
  ));

  return allowed ? normalized : null;
}

export function readSafeReturnTo(
  search: string,
  allowedPrefixes: readonly string[],
): string | null {
  return sanitizeInternalReturnTo(new URLSearchParams(search).get('returnTo'), allowedPrefixes);
}

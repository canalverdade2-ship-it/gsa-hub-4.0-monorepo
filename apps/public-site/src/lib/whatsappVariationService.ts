/**
 * WhatsApp Variation Engine (Requirement R2)
 *
 * Provides dynamic variation capabilities for WhatsApp notifications:
 * 1. Time-contextual greetings (UTC-3 Brazil Time) & varied institutional footers.
 * 2. Non-visual entropy injection via Zero-Width characters (\u200B, \u200C, \u200D).
 * 3. Dynamic URL tracking parameter injection (?t=[timestamp]&ref=[random]).
 * 4. Safe ISO 32000-1 PDF byte variation without corrupting PDF renderability.
 */

export interface VariationOptions {
  enableZeroWidth?: boolean;
  enableUrlRandomizer?: boolean;
  clienteNome?: string;
  timeZone?: string;
  customUrlParams?: Record<string, string>;
  date?: Date;
}

// ─── 1. Saudações e Rodapés Dinâmicos (R2.1) ────────────────────────────────

export interface GreetingPools {
  morningWithName: string[];
  afternoonWithName: string[];
  eveningWithName: string[];
  morningWithoutName: string[];
  afternoonWithoutName: string[];
  eveningWithoutName: string[];
}

export const GREETING_POOLS: GreetingPools = {
  morningWithName: [
    'Bom dia, *{nome}*! 👋',
    'Olá, bom dia, *{nome}*! ✨',
    'Oi, *{nome}*, muito bom dia! ☀️',
    'Olá *{nome}*, tenha um excelente dia! 👋',
  ],
  afternoonWithName: [
    'Boa tarde, *{nome}*! 👋',
    'Olá, boa tarde, *{nome}*! ✨',
    'Oi, *{nome}*, tudo bem? Boa tarde! 🌤️',
    'Olá *{nome}*, esperamos que sua tarde esteja excelente! 👋',
  ],
  eveningWithName: [
    'Boa noite, *{nome}*! 👋',
    'Olá, boa noite, *{nome}*! 🌙',
    'Oi, *{nome}*, tudo bem? Boa noite! ✨',
    'Olá *{nome}*, esperamos que sua noite esteja tranquila! 👋',
  ],
  morningWithoutName: [
    'Bom dia! 👋',
    'Olá, bom dia! ✨',
    'Oi, tudo bem? Muito bom dia! ☀️',
    'Olá, tenha um excelente dia! 👋',
    'Olá! 👋',
    'Olá, prezado(a) cliente! 👋',
  ],
  afternoonWithoutName: [
    'Boa tarde! 👋',
    'Olá, boa tarde! ✨',
    'Oi, tudo bem? Boa tarde! 🌤️',
    'Olá, esperamos que sua tarde esteja excelente! 👋',
    'Olá! 👋',
    'Olá, prezado(a) cliente! 👋',
  ],
  eveningWithoutName: [
    'Boa noite! 👋',
    'Olá, boa noite! 🌙',
    'Oi, tudo bem? Boa noite! ✨',
    'Olá, esperamos que sua noite esteja tranquila! 👋',
    'Olá! 👋',
    'Olá, prezado(a) cliente! 👋',
  ],
};

export const FOOTER_POOL: readonly string[] = [
  '_Mensagem enviada via GSA HUB._',
  '_Mensagem automática enviada com segurança via GSA HUB._',
  '_Notificação gerada pelo sistema GSA HUB._',
  '_Atendimento e Gestão Integrada • GSA HUB._',
  '_Enviado através da plataforma GSA HUB._',
  '_GSA HUB • Gestão de Serviços & Tecnologia._',
  '_Sistema GSA HUB — Comunicação Oficial._',
] as const;

/**
 * Calculates current hour in Brazil (UTC-3 / America/Sao_Paulo).
 */
export function getBrazilHour(date: Date = new Date()): number {
  try {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      hour12: false,
    });
    const hourStr = formatter.format(date);
    const hour = parseInt(hourStr, 10);
    return isNaN(hour) ? (date.getUTCHours() - 3 + 24) % 24 : (hour < 0 ? hour + 24 : hour % 24);
  } catch {
    const utcHours = date.getUTCHours();
    return (utcHours - 3 + 24) % 24;
  }
}

/**
 * Selects a dynamic, time-contextual greeting based on Brazil Time (UTC-3).
 */
export function getDynamicGreeting(clienteNome?: string, date: Date = new Date()): string {
  const hour = getBrazilHour(date);
  const cleanName = clienteNome?.trim();

  let pool: string[];
  if (hour >= 5 && hour < 12) {
    pool = cleanName ? GREETING_POOLS.morningWithName : GREETING_POOLS.morningWithoutName;
  } else if (hour >= 12 && hour < 18) {
    pool = cleanName ? GREETING_POOLS.afternoonWithName : GREETING_POOLS.afternoonWithoutName;
  } else {
    pool = cleanName ? GREETING_POOLS.eveningWithName : GREETING_POOLS.eveningWithoutName;
  }

  const randomIndex = Math.floor(Math.random() * pool.length);
  const template = pool[randomIndex] ?? pool[0] ?? 'Olá! 👋';

  return cleanName ? template.replace('{nome}', cleanName) : template;
}

/**
 * Selects a random institutional footer from the pool.
 */
export function getDynamicFooter(): string {
  const randomIndex = Math.floor(Math.random() * FOOTER_POOL.length);
  return FOOTER_POOL[randomIndex] ?? FOOTER_POOL[0] ?? '_Mensagem enviada via GSA HUB._';
}

/**
 * Injects or replaces dynamic time-contextual greeting and institutional footer in a message.
 */
export function applyDynamicGreetingAndFooter(
  message: string,
  clienteNome?: string,
  options?: { date?: Date }
): string {
  if (!message || typeof message !== 'string') {
    return message;
  }

  let effectiveName = clienteNome?.trim();
  let result = message;

  // 1. Detect and replace existing greeting if present
  // Matches "Olá, *Nome*! 👋", "Olá, ...!", "Bom dia...!", "Boa tarde...!", "Boa noite...!", "Oi...!"
  const greetingRegex = /(?:^|\n)(?:🏢 \*[^\n]+\*\n\n)?((?:Olá|Bom dia|Boa tarde|Boa noite|Oi)[^\n]*)/i;
  const matchGreeting = result.match(greetingRegex);

  if (matchGreeting && matchGreeting[1]) {
    const matchedLine = matchGreeting[1].trim();
    // If no client name was passed explicitly, try extracting from '*Nome*' in the existing greeting
    if (!effectiveName) {
      const nameMatch = matchedLine.match(/\*([^*]+)\*/);
      if (nameMatch && nameMatch[1]) {
        effectiveName = nameMatch[1].trim();
      }
    }

    const newGreeting = getDynamicGreeting(effectiveName, options?.date);

    // If message starts with the standard header, preserve header
    if (result.startsWith('🏢 *GSA — Gestão de Serviços*\n\n')) {
      const header = '🏢 *GSA — Gestão de Serviços*\n\n';
      const rest = result.substring(header.length);
      result = header + rest.replace(matchedLine, newGreeting);
    } else {
      result = result.replace(matchedLine, newGreeting);
    }
  }

  const newFooter = getDynamicFooter();

  // 2. Detect and replace existing footer if present
  // Matches "_Mensagem enviada via GSA HUB._" and variants
  const footerRegex = /(?:_Mensagem[^\n]+_|_Notificação gerada[^\n]+_|_Atendimento e Gestão[^\n]+_|_Enviado através[^\n]+_|_GSA HUB •[^\n]+_|_Sistema GSA HUB[^\n]+_)\s*$/i;

  if (footerRegex.test(result)) {
    result = result.replace(footerRegex, newFooter);
  } else {
    // If no recognizable footer at the end, append it
    result = `${result.trimEnd()}\n\n${newFooter}`;
  }

  return result;
}

// ─── 2. Injeção de Espaços Zero-Width (\u200B) (R2.2) ─────────────────────────

const ZERO_WIDTH_CHARS = ['\u200B', '\u200C', '\u200D'] as const;
let zeroWidthEntropySequence = 0n;

function createCollisionFreeZeroWidthSalt(): string {
  zeroWidthEntropySequence += 1n;
  // Timestamp + contador monotônico evitam colisões dentro da mesma execução,
  // inclusive quando várias mensagens são montadas no mesmo milissegundo.
  let value = (BigInt(Date.now()) << 24n) + zeroWidthEntropySequence;
  let salt = '';
  for (let i = 0; i < 32; i += 1) {
    const index = Number(value % 3n);
    salt += ZERO_WIDTH_CHARS[index];
    value /= 3n;
  }
  return salt;
}

/**
 * Injects invisible zero-width entropy into safe text positions (line breaks, punctuation)
 * while strictly preserving URLs, WhatsApp markdown formatting, and visual readability.
 */
export function injectZeroWidthEntropy(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  const salt = createCollisionFreeZeroWidthSalt();

  // Process text line by line to protect URL lines and markdown formatting
  const lines = text.split('\n');
  const processedLines = lines.map((line) => {
    // If the entire line is a URL or starts with http:// / https://, do not alter its internals
    if (/^\s*https?:\/\//i.test(line)) {
      return line;
    }

    // Split line into URL and non-URL parts to never corrupt URLs
    const urlPattern = /(https?:\/\/[^\s\)\>\]]+)/gi;
    const parts = line.split(urlPattern);

    const lineProcessed = parts
      .map((part) => {
        // If part is a URL, return intact
        if (/^https?:\/\//i.test(part)) {
          return part;
        }

        // For non-URL text, inject zero-width space after safe punctuation (. ! ?)
        // but avoid breaking markdown asterisks (*), underscores (_), tildes (~), or backticks (`)
        return part.replace(/([.!?])(\s+)/g, (match, punc, space) => {
          if (Math.random() > 0.4) {
            const zChar = ZERO_WIDTH_CHARS[Math.floor(Math.random() * ZERO_WIDTH_CHARS.length)] ?? '\u200B';
            return `${punc}${space}${zChar}`;
          }
          return match;
        });
      })
      .join('');

    // Optionally append 1 zero-width char at the end of non-empty line
    if (lineProcessed.trim().length > 0 && Math.random() > 0.5) {
      const zChar = ZERO_WIDTH_CHARS[Math.floor(Math.random() * ZERO_WIDTH_CHARS.length)] ?? '\u200B';
      return `${lineProcessed}${zChar}`;
    }

    return lineProcessed;
  });

  return `${processedLines.join('\n')}${salt}`;
}

// ─── 3. Injeção de Parâmetros em URLs (R2.3) ───────────────────────────────────

/**
 * Exempt domains/protocols that should never have tracking params injected (deep links).
 */
const EXEMPT_URL_PATTERNS = [
  /^https?:\/\/api\.whatsapp\.com/i,
  /^https?:\/\/wa\.me/i,
  /^wa\.me/i,
  /^api\.whatsapp\.com/i,
  /^mailto:/i,
  /^tel:/i,
];

/**
 * Injects dynamic tracking query parameters (?t=[timestamp]&ref=[random]) into HTTP/HTTPS URLs,
 * preserving existing query parameters and #hash fragments.
 */
export function injectUrlTrackingParams(url: string, customParams?: Record<string, string>): string {
  if (!url || typeof url !== 'string') {
    return url;
  }

  const trimmedUrl = url.trim();

  // Check exemptions (WhatsApp deep links, tel, mailto)
  for (const pattern of EXEMPT_URL_PATTERNS) {
    if (pattern.test(trimmedUrl)) {
      return url;
    }
  }

  const t = customParams?.t ?? Date.now().toString();
  const ref = customParams?.ref ?? Math.random().toString(36).substring(2, 8);

  try {
    const urlObj = new URL(trimmedUrl);

    // Set tracking parameters
    urlObj.searchParams.set('t', t);
    urlObj.searchParams.set('ref', ref);

    // Set any additional custom parameters
    if (customParams) {
      for (const [key, value] of Object.entries(customParams)) {
        if (key !== 't' && key !== 'ref') {
          urlObj.searchParams.set(key, value);
        }
      }
    }

    return urlObj.toString();
  } catch {
    // Fallback parser for relative URLs or malformed strings with hash & query
    const hashIndex = trimmedUrl.indexOf('#');
    let base = hashIndex !== -1 ? trimmedUrl.substring(0, hashIndex) : trimmedUrl;
    const hash = hashIndex !== -1 ? trimmedUrl.substring(hashIndex) : '';

    const separator = base.includes('?') ? '&' : '?';
    let extraParams = `t=${encodeURIComponent(t)}&ref=${encodeURIComponent(ref)}`;

    if (customParams) {
      for (const [key, value] of Object.entries(customParams)) {
        if (key !== 't' && key !== 'ref') {
          extraParams += `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
        }
      }
    }

    return `${base}${separator}${extraParams}${hash}`;
  }
}

/**
 * Finds all eligible HTTP/HTTPS URLs in a message and replaces them with randomized tracking parameters.
 */
export function randomizeMessageUrls(message: string, customParams?: Record<string, string>): string {
  if (!message || typeof message !== 'string') {
    return message;
  }

  // Regex to match URLs while being careful not to capture trailing punctuation at sentence ends
  const urlRegex = /(https?:\/\/[^\s\)\>\]"']+)/gi;

  return message.replace(urlRegex, (matchedUrl) => {
    // Separate trailing punctuation (like '.', ',', '!', '?') if attached to end of URL in text
    let cleanUrl = matchedUrl;
    let trailingPunctuation = '';

    const trailingMatch = matchedUrl.match(/([.,;:!?]+)$/);
    if (trailingMatch && trailingMatch[1]) {
      cleanUrl = matchedUrl.substring(0, matchedUrl.length - trailingMatch[1].length);
      trailingPunctuation = trailingMatch[1];
    }

    const modifiedUrl = injectUrlTrackingParams(cleanUrl, customParams);
    return `${modifiedUrl}${trailingPunctuation}`;
  });
}

// ─── 4. Variação Binária Segura de PDFs (ISO 32000-1) (R2.4) ───────────────────

/**
 * PDF Variation Engine
 * Appends safe ISO 32000-1 trailing comment bytes to guarantee unique buffer SHA-256
 * checksums across Base64, Blob, and Uint8Array representations without corrupting rendering.
 */
export const pdfVariationEngine = {
  /**
   * Applies variation to a Base64 or Data URI string representation of a PDF.
   */
  applyBase64Variation(base64OrDataUri: string): string {
    if (!base64OrDataUri || typeof base64OrDataUri !== 'string') {
      return base64OrDataUri;
    }

    const isDataUri = base64OrDataUri.startsWith('data:');
    let prefix = 'data:application/pdf;base64,';
    let rawBase64 = base64OrDataUri;

    if (isDataUri) {
      const commaIndex = base64OrDataUri.indexOf(',');
      if (commaIndex !== -1) {
        prefix = base64OrDataUri.substring(0, commaIndex + 1);
        rawBase64 = base64OrDataUri.substring(commaIndex + 1);
      }
    }

    try {
      const saltComment = `\n% GSA-RND-${Date.now()}-${Math.random().toString(36).substring(2, 10)}\n`;

      const nodeBuffer = (globalThis as unknown as { Buffer?: { from: (data: string, encoding: string) => { toString: (enc: string) => string }; concat: (list: any[]) => { toString: (enc: string) => string } } }).Buffer;

      if (nodeBuffer) {
        const buffer = nodeBuffer.from(rawBase64, 'base64');
        const saltBuffer = nodeBuffer.from(saltComment, 'utf-8');
        const combined = nodeBuffer.concat([buffer, saltBuffer]);
        const resultBase64 = combined.toString('base64');
        return isDataUri ? `${prefix}${resultBase64}` : resultBase64;
      } else if (typeof atob === 'function' && typeof btoa === 'function') {
        const binaryString = atob(rawBase64) + saltComment;
        const resultBase64 = btoa(binaryString);
        return isDataUri ? `${prefix}${resultBase64}` : resultBase64;
      }

      return base64OrDataUri;
    } catch (err) {
      console.warn('⚠️ Falha ao aplicar variação em PDF Base64:', err);
      return base64OrDataUri;
    }
  },

  /**
   * Applies variation to a Blob representation of a PDF.
   */
  applyBlobVariation(blob: Blob): Blob {
    if (!blob) {
      return blob;
    }

    try {
      const saltComment = `\n% GSA-RND-${Date.now()}-${Math.random().toString(36).substring(2, 10)}\n`;
      const saltBlob = new Blob([saltComment], { type: 'text/plain' });
      return new Blob([blob, saltBlob], { type: blob.type || 'application/pdf' });
    } catch (err) {
      console.warn('⚠️ Falha ao aplicar variação em PDF Blob:', err);
      return blob;
    }
  },

  /**
   * Applies variation to a Uint8Array buffer representation of a PDF.
   */
  applyUint8ArrayVariation(buffer: Uint8Array): Uint8Array {
    if (!buffer) {
      return buffer;
    }

    try {
      const saltComment = `\n% GSA-RND-${Date.now()}-${Math.random().toString(36).substring(2, 10)}\n`;
      const saltBytes = new TextEncoder().encode(saltComment);

      const newBuffer = new Uint8Array(buffer.length + saltBytes.length);
      newBuffer.set(buffer, 0);
      newBuffer.set(saltBytes, buffer.length);

      return newBuffer;
    } catch (err) {
      console.warn('⚠️ Falha ao aplicar variação em PDF Uint8Array:', err);
      return buffer;
    }
  },
};

// ─── 5. Orquestrador de Variação Completa ─────────────────────────────────────

/**
 * Applies all variation strategies (greetings/footers, URL tracking, zero-width entropy)
 * according to provided options.
 */
export function applyAllVariations(message: string, options?: VariationOptions): string {
  if (!message || typeof message !== 'string') {
    return message;
  }

  let transformed = applyDynamicGreetingAndFooter(message, options?.clienteNome, {
    date: options?.date,
  });

  if (options?.enableUrlRandomizer !== false) {
    transformed = randomizeMessageUrls(transformed, options?.customUrlParams);
  }

  if (options?.enableZeroWidth !== false) {
    transformed = injectZeroWidthEntropy(transformed);
  }

  return transformed;
}

import { describe, it, expect } from 'vitest';
import {
  getBrazilHour,
  getDynamicGreeting,
  getDynamicFooter,
  applyDynamicGreetingAndFooter,
  injectZeroWidthEntropy,
  injectUrlTrackingParams,
  randomizeMessageUrls,
  pdfVariationEngine,
  applyAllVariations,
  GREETING_POOLS,
  FOOTER_POOL,
} from '../lib/whatsappVariationService';

// Helper to compute a simple SHA-256 hex digest using Web Crypto API or Node crypto
async function computeSha256(data: string | Uint8Array | ArrayBuffer): Promise<string> {
  let buffer: Uint8Array;
  if (typeof data === 'string') {
    buffer = new TextEncoder().encode(data);
  } else if (data instanceof Uint8Array) {
    buffer = data;
  } else {
    buffer = new Uint8Array(data);
  }

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer as any);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback simple checksum if subtle crypto is unavailable
  let hash = 0;
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    if (byte !== undefined) {
      hash = ((hash << 5) - hash + byte) | 0;
    }
  }
  return Math.abs(hash).toString(16);
}

describe('WhatsApp Variation Engine Test Suite (Requirement R2)', () => {
  // ─── 1. Dynamic Greetings & Institutional Footers (R2.1) ─────────────────────
  describe('1. Dynamic Greetings & Institutional Footers', () => {
    it('should correctly calculate Brazil hour (UTC-3)', () => {
      // 15:00 UTC is 12:00 in Brazil
      const dateUtc15 = new Date('2026-08-27T15:00:00Z');
      expect(getBrazilHour(dateUtc15)).toBe(12);

      // 03:00 UTC is 00:00 in Brazil
      const dateUtc03 = new Date('2026-08-27T03:00:00Z');
      expect(getBrazilHour(dateUtc03)).toBe(0);

      // 10:00 UTC is 07:00 in Brazil
      const dateUtc10 = new Date('2026-08-27T10:00:00Z');
      expect(getBrazilHour(dateUtc10)).toBe(7);

      // 22:00 UTC is 19:00 in Brazil
      const dateUtc22 = new Date('2026-08-27T22:00:00Z');
      expect(getBrazilHour(dateUtc22)).toBe(19);
    });

    it('should select morning greeting during morning hours (05:00 - 11:59)', () => {
      const morningDate = new Date('2026-08-27T11:00:00Z'); // 08:00 BRT
      const greeting = getDynamicGreeting('Adriano', morningDate);

      expect(greeting).toContain('*Adriano*');
      const isMorningGreeting = GREETING_POOLS.morningWithName.some((template) =>
        greeting.startsWith(template.replace('{nome}', 'Adriano').split('!')[0] ?? '')
      );
      expect(isMorningGreeting).toBe(true);
    });

    it('should select afternoon greeting during afternoon hours (12:00 - 17:59)', () => {
      const afternoonDate = new Date('2026-08-27T17:00:00Z'); // 14:00 BRT
      const greeting = getDynamicGreeting('Beatriz', afternoonDate);

      expect(greeting).toContain('*Beatriz*');
      const isAfternoonGreeting = GREETING_POOLS.afternoonWithName.some((template) =>
        greeting.startsWith(template.replace('{nome}', 'Beatriz').split('!')[0] ?? '')
      );
      expect(isAfternoonGreeting).toBe(true);
    });

    it('should select evening/night greeting during night hours (18:00 - 04:59)', () => {
      const nightDate = new Date('2026-08-27T23:00:00Z'); // 20:00 BRT
      const greeting = getDynamicGreeting('Carlos', nightDate);

      expect(greeting).toContain('*Carlos*');
      const isEveningGreeting = GREETING_POOLS.eveningWithName.some((template) =>
        greeting.startsWith(template.replace('{nome}', 'Carlos').split('!')[0] ?? '')
      );
      expect(isEveningGreeting).toBe(true);
    });

    it('should properly support non-ASCII characters in client names', () => {
      const specialName = 'João da Conceição & Filhos';
      const afternoonDate = new Date('2026-08-27T17:00:00Z');
      const greeting = getDynamicGreeting(specialName, afternoonDate);

      expect(greeting).toContain(`*${specialName}*`);
    });

    it('should generate greeting without client name when none is provided', () => {
      const morningDate = new Date('2026-08-27T11:00:00Z'); // 08:00 BRT
      const greeting = getDynamicGreeting(undefined, morningDate);

      expect(greeting).not.toContain('{nome}');
      expect(GREETING_POOLS.morningWithoutName).toContain(greeting);
    });

    it('should select valid institutional footers from FOOTER_POOL', () => {
      const footersSample = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const footer = getDynamicFooter();
        expect(FOOTER_POOL).toContain(footer);
        footersSample.add(footer);
      }
      // Across 50 samples, we should have seen more than 1 distinct footer
      expect(footersSample.size).toBeGreaterThan(1);
    });

    it('should replace greeting and footer in an existing formatted message', () => {
      const originalMessage = `🏢 *GSA — Gestão de Serviços*\n\nOlá, *Adriano Farias*! 👋\n\nSua fatura foi aprovada.\n\n_Mensagem enviada via GSA HUB._`;
      const morningDate = new Date('2026-08-27T11:00:00Z'); // 08:00 BRT

      const modified = applyDynamicGreetingAndFooter(originalMessage, undefined, {
        date: morningDate,
      });

      expect(modified).toContain('🏢 *GSA — Gestão de Serviços*');
      expect(modified).toContain('*Adriano Farias*');
      expect(modified).toContain('Sua fatura foi aprovada.');
      expect(FOOTER_POOL.some((f) => modified.includes(f))).toBe(true);
    });

    it('should append footer if original message had no footer', () => {
      const rawMessage = 'Aviso importante sobre seu contrato.';
      const modified = applyDynamicGreetingAndFooter(rawMessage);

      expect(modified).toContain('Aviso importante sobre seu contrato.');
      expect(FOOTER_POOL.some((f) => modified.includes(f))).toBe(true);
    });

    it('should safely handle empty or non-string messages in applyDynamicGreetingAndFooter', () => {
      expect(applyDynamicGreetingAndFooter('')).toBe('');
      // @ts-ignore test non-string input
      expect(applyDynamicGreetingAndFooter(null)).toBe(null);
    });
  });

  // ─── 2. Zero-Width Space Entropy Injection (R2.2) ───────────────────────────
  describe('2. Zero-Width Space Non-Visual Entropy (\u200B, \u200C, \u200D)', () => {
    it('should produce unique SHA-256 hashes across 100 consecutive calls for identical text', async () => {
      const template = `🏢 *GSA — Gestão de Serviços*\n\nOlá, *Adriano*! 👋\n\nSua fatura #1029 no valor de R$ 1.500,00 está disponível.\n\nAcesse: https://hub.gsa.com/fatura/1029\n\n_Mensagem enviada via GSA HUB._`;

      const hashes = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const randomized = injectZeroWidthEntropy(template);
        const hash = await computeSha256(randomized);
        hashes.add(hash);
      }

      // Every single generated string must have a unique hash (0 collisions out of 100)
      expect(hashes.size).toBe(100);
    });

    it('should maintain 100% visual identity when zero-width characters are stripped', () => {
      const message = `🏢 *GSA — Gestão de Serviços*\n\nOlá, *Adriano*! 👋\n\nSua fatura #1029 no valor de R$ 1.500,00 foi gerada com sucesso!\n\n_Mensagem enviada via GSA HUB._`;

      const randomized = injectZeroWidthEntropy(message);

      // Verify that randomized contains zero-width chars
      expect(/[\u200B\u200C\u200D]/.test(randomized)).toBe(true);

      // Stripping zero-width characters MUST yield the exact original message
      const visualCleaned = randomized.replace(/[\u200B\u200C\u200D]/g, '');
      expect(visualCleaned).toBe(message);
    });

    it('should NEVER inject zero-width spaces inside URLs', () => {
      const message = `Acesse o link oficial: https://hub.gsa.com/documentos/fatura-123.pdf e confira.`;
      const randomized = injectZeroWidthEntropy(message);

      const urlMatch = randomized.match(/https?:\/\/[^\s\)\>\]]+/);
      expect(urlMatch).not.toBeNull();
      const extractedUrl = urlMatch![0];

      // The extracted URL must contain ZERO zero-width characters
      expect(/[\u200B\u200C\u200D]/.test(extractedUrl)).toBe(false);
      expect(extractedUrl).toBe('https://hub.gsa.com/documentos/fatura-123.pdf');
    });

    it('should preserve WhatsApp markdown formatting tags (*bold*, _italic_, ~strike~, `code`)', () => {
      const markdownMessage = `*Texto em Negrito* e _Texto em Itálico_ e ~Texto Riscado~ e \`Código Monospaced\``;
      const randomized = injectZeroWidthEntropy(markdownMessage);

      // Stripping zero-width characters preserves markdown syntax completely
      expect(randomized.replace(/[\u200B\u200C\u200D]/g, '')).toBe(markdownMessage);
      expect(randomized).toContain('*Texto em Negrito*');
      expect(randomized).toContain('_Texto em Itálico_');
      expect(randomized).toContain('~Texto Riscado~');
      expect(randomized).toContain('`Código Monospaced`');
    });

    it('should safely handle empty or non-string inputs in injectZeroWidthEntropy', () => {
      expect(injectZeroWidthEntropy('')).toBe('');
      // @ts-ignore test non-string input
      expect(injectZeroWidthEntropy(null)).toBe(null);
    });
  });

  // ─── 3. Dynamic URL Tracking Parameters (R2.3) ──────────────────────────────
  describe('3. Dynamic URL Tracking Parameters (?t=...&ref=...)', () => {
    it('should safely inject ?t= and &ref= into simple HTTP/HTTPS URLs', () => {
      const url = 'https://gsa.com/portal';
      const modified = injectUrlTrackingParams(url, { t: '1724784000000', ref: 'abc123' });

      expect(modified).toBe('https://gsa.com/portal?t=1724784000000&ref=abc123');
    });

    it('should preserve existing query parameters when adding tracking params', () => {
      const url = 'https://gsa.com/fatura?id=88&tipo=pdf';
      const modified = injectUrlTrackingParams(url, { t: '1724784000000', ref: 'xyz789' });

      const parsed = new URL(modified);
      expect(parsed.searchParams.get('id')).toBe('88');
      expect(parsed.searchParams.get('tipo')).toBe('pdf');
      expect(parsed.searchParams.get('t')).toBe('1724784000000');
      expect(parsed.searchParams.get('ref')).toBe('xyz789');
    });

    it('should preserve #hash fragment at the end of the URL', () => {
      const url = 'https://gsa.com/portal#pagamentos';
      const modified = injectUrlTrackingParams(url, { t: '1724784000000', ref: 'hash123' });

      expect(modified).toBe('https://gsa.com/portal?t=1724784000000&ref=hash123#pagamentos');
      expect(modified.endsWith('#pagamentos')).toBe(true);
    });

    it('should preserve both query parameters and #hash fragment', () => {
      const url = 'https://gsa.com/view?doc=1&auth=true#top';
      const modified = injectUrlTrackingParams(url, { t: '1724784000000', ref: 'combo456' });

      expect(modified).toContain('doc=1');
      expect(modified).toContain('auth=true');
      expect(modified).toContain('t=1724784000000');
      expect(modified).toContain('ref=combo456');
      expect(modified.endsWith('#top')).toBe(true);
    });

    it('should strictly EXEMPT WhatsApp deep links and phone/email schemes', () => {
      const exemptUrls = [
        'https://wa.me/5511999999999',
        'http://wa.me/5511999999999',
        'wa.me/5511999999999',
        'https://api.whatsapp.com/send?phone=5511999999999',
        'http://api.whatsapp.com/send?phone=5511999999999',
        'mailto:contato@gsa.com.br',
        'tel:5511920857756',
      ];

      for (const exempt of exemptUrls) {
        const result = injectUrlTrackingParams(exempt);
        expect(result).toBe(exempt);
      }
    });

    it('should replace all URLs in a full message text via randomizeMessageUrls while handling trailing punctuation', () => {
      const message = `Acesse https://gsa.com/portal. Depois consulte https://gsa.com/doc?id=99#view! Dúvidas: https://wa.me/5511920857756.`;
      const randomized = randomizeMessageUrls(message, { t: '1724784000000', ref: 'msg999' });

      expect(randomized).toContain('https://gsa.com/portal?t=1724784000000&ref=msg999.');
      expect(randomized).toContain('https://gsa.com/doc?id=99&t=1724784000000&ref=msg999#view!');
      // WhatsApp deep link must remain untouched
      expect(randomized).toContain('https://wa.me/5511920857756.');
    });

    it('should safely handle empty or non-string inputs in URL functions', () => {
      expect(injectUrlTrackingParams('')).toBe('');
      // @ts-ignore test non-string input
      expect(injectUrlTrackingParams(null)).toBe(null);

      expect(randomizeMessageUrls('')).toBe('');
      // @ts-ignore test non-string input
      expect(randomizeMessageUrls(null)).toBe(null);
    });
  });

  // ─── 4. Safe PDF Binary Variation Engine (R2.4) ─────────────────────────────
  describe('4. Safe PDF Binary Variation Engine (ISO 32000-1)', () => {
    const mockPdfBinary = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 >>\nstartxref\n50\n%%EOF';

    it('should vary Base64 PDF string producing unique checksums while preserving %PDF- and %%EOF', async () => {
      const originalBase64 = Buffer.from(mockPdfBinary, 'utf-8').toString('base64');
      const originalHash = await computeSha256(originalBase64);

      const modifiedBase64 = pdfVariationEngine.applyBase64Variation(originalBase64);
      const modifiedHash = await computeSha256(modifiedBase64);

      expect(modifiedBase64).not.toBe(originalBase64);
      expect(modifiedHash).not.toBe(originalHash);

      // Decoded PDF verification
      const decodedPdf = Buffer.from(modifiedBase64, 'base64').toString('utf-8');
      expect(decodedPdf.startsWith('%PDF-1.4')).toBe(true);
      expect(decodedPdf).toContain('%%EOF');
      expect(decodedPdf).toContain('% GSA-RND-');
    });

    it('should handle Data URI Base64 format correctly (data:application/pdf;base64,...)', () => {
      const originalDataUri = `data:application/pdf;base64,${Buffer.from(mockPdfBinary, 'utf-8').toString('base64')}`;

      const modifiedDataUri = pdfVariationEngine.applyBase64Variation(originalDataUri);

      expect(modifiedDataUri.startsWith('data:application/pdf;base64,')).toBe(true);
      expect(modifiedDataUri).not.toBe(originalDataUri);

      const rawBase64 = modifiedDataUri.replace('data:application/pdf;base64,', '');
      const decoded = Buffer.from(rawBase64, 'base64').toString('utf-8');
      expect(decoded.startsWith('%PDF-1.4')).toBe(true);
      expect(decoded).toContain('% GSA-RND-');
    });

    it('should vary Blob PDF producing a new Blob with increased size and unique content', async () => {
      const originalBlob = new Blob([mockPdfBinary], { type: 'application/pdf' });
      const modifiedBlob = pdfVariationEngine.applyBlobVariation(originalBlob);

      expect(modifiedBlob.size).toBeGreaterThan(originalBlob.size);
      expect(modifiedBlob.type).toBe('application/pdf');

      const text = await modifiedBlob.text();
      expect(text.startsWith('%PDF-1.4')).toBe(true);
      expect(text).toContain('%%EOF');
      expect(text).toContain('% GSA-RND-');
    });

    it('should vary Uint8Array buffer producing different SHA-256 hash', async () => {
      const originalBuffer = new TextEncoder().encode(mockPdfBinary);
      const originalHash = await computeSha256(originalBuffer);

      const modifiedBuffer = pdfVariationEngine.applyUint8ArrayVariation(originalBuffer);
      const modifiedHash = await computeSha256(modifiedBuffer);

      expect(modifiedBuffer.length).toBeGreaterThan(originalBuffer.length);
      expect(modifiedHash).not.toBe(originalHash);

      const decoded = new TextDecoder().decode(modifiedBuffer);
      expect(decoded.startsWith('%PDF-1.4')).toBe(true);
      expect(decoded).toContain('%%EOF');
      expect(decoded).toContain('% GSA-RND-');
    });

    it('should safely handle empty/invalid inputs for pdfVariationEngine', () => {
      expect(pdfVariationEngine.applyBase64Variation('')).toBe('');
      // @ts-ignore test invalid input
      expect(pdfVariationEngine.applyBase64Variation(null)).toBe(null);

      // @ts-ignore test invalid input
      expect(pdfVariationEngine.applyBlobVariation(null)).toBe(null);

      // @ts-ignore test invalid input
      expect(pdfVariationEngine.applyUint8ArrayVariation(null)).toBe(null);
    });
  });

  // ─── 5. Full Variation Orchestrator (applyAllVariations) ─────────────────────
  describe('5. Full Variation Orchestrator (applyAllVariations)', () => {
    it('should transform message with greeting, URL tracking, and zero-width entropy in one call', async () => {
      const template = `Olá, *Adriano*! 👋\n\nAcesse sua fatura em https://gsa.com/fatura/500\n\n_Mensagem enviada via GSA HUB._`;

      const result1 = applyAllVariations(template, {
        clienteNome: 'Adriano',
        date: new Date('2026-08-27T17:00:00Z'), // 14:00 BRT
      });

      const result2 = applyAllVariations(template, {
        clienteNome: 'Adriano',
        date: new Date('2026-08-27T17:00:00Z'), // 14:00 BRT
      });

      // Different hashes due to entropy & dynamic params
      const hash1 = await computeSha256(result1);
      const hash2 = await computeSha256(result2);
      expect(hash1).not.toBe(hash2);

      // Has URL params
      expect(result1).toContain('https://gsa.com/fatura/500?t=');
      expect(result1).toContain('&ref=');

      // Has zero width chars
      expect(/[\u200B\u200C\u200D]/.test(result1)).toBe(true);
    });

    it('should safely handle empty or non-string inputs in applyAllVariations', () => {
      expect(applyAllVariations('')).toBe('');
      // @ts-ignore test invalid input
      expect(applyAllVariations(null)).toBe(null);
    });
  });
});

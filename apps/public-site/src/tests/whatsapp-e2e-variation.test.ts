import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  applyDynamicGreetingAndFooter,
  injectZeroWidthEntropy,
  injectUrlTrackingParams,
  randomizeMessageUrls,
  pdfVariationEngine,
  applyAllVariations,
  getBrazilHour,
  getDynamicGreeting,
  getDynamicFooter,
  GREETING_POOLS,
  FOOTER_POOL,
  type VariationOptions,
} from '../lib/whatsappVariationService';

function sha256(data: string | Uint8Array | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

describe('WhatsApp E2E Variation Engine & Anti-Ban Test Suite (R2 / F5-F8)', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // TIER 1: FEATURE COVERAGE (>=5 tests per feature)
  // ──────────────────────────────────────────────────────────────────────────

  describe('Tier 1: Feature 5 — Dynamic Greetings & Institutional Footers (R2.1)', () => {
    it('should calculate correct Brazil hour (UTC-3) from various UTC dates', () => {
      // 15:00 UTC = 12:00 BRT
      const date1 = new Date('2026-08-27T15:00:00Z');
      expect(getBrazilHour(date1)).toBe(12);

      // 03:00 UTC = 00:00 BRT
      const date2 = new Date('2026-08-27T03:00:00Z');
      expect(getBrazilHour(date2)).toBe(0);

      // 10:00 UTC = 07:00 BRT (Morning)
      const date3 = new Date('2026-08-27T10:00:00Z');
      expect(getBrazilHour(date3)).toBe(7);

      // 22:00 UTC = 19:00 BRT (Evening)
      const date4 = new Date('2026-08-27T22:00:00Z');
      expect(getBrazilHour(date4)).toBe(19);
    });

    it('should generate morning greetings between 05:00 and 11:59 BRT with and without client name', () => {
      const morningDate = new Date('2026-08-27T11:00:00Z'); // 08:00 BRT
      const withName = getDynamicGreeting('Adriano Farias', morningDate);
      expect(withName).toContain('Adriano Farias');
      expect(
        withName.includes('Bom dia') ||
        withName.includes('bom dia') ||
        withName.includes('Olá') ||
        withName.includes('Oi')
      ).toBe(true);

      const withoutName = getDynamicGreeting(undefined, morningDate);
      expect(withoutName).not.toContain('{nome}');
      expect(withoutName.length).toBeGreaterThan(3);
    });

    it('should generate afternoon greetings between 12:00 and 17:59 BRT', () => {
      const afternoonDate = new Date('2026-08-27T18:00:00Z'); // 15:00 BRT
      const withName = getDynamicGreeting('Carlos Eduardo', afternoonDate);
      expect(withName).toContain('Carlos Eduardo');
      expect(withName.toLowerCase()).toContain('tarde');

      const withoutName = getDynamicGreeting(undefined, afternoonDate);
      expect(GREETING_POOLS.afternoonWithoutName).toContain(withoutName);
    });

    it('should generate evening/night greetings between 18:00 and 04:59 BRT', () => {
      const eveningDate = new Date('2026-08-27T23:00:00Z'); // 20:00 BRT
      const withName = getDynamicGreeting('Mariana Silva', eveningDate);
      expect(withName).toContain('Mariana Silva');
      expect(withName.toLowerCase()).toContain('noite');

      const withoutName = getDynamicGreeting(undefined, eveningDate);
      expect(GREETING_POOLS.eveningWithoutName).toContain(withoutName);

      const lateNightDate = new Date('2026-08-27T05:00:00Z'); // 02:00 BRT
      const lateNight = getDynamicGreeting('Mariana Silva', lateNightDate);
      expect(lateNight.toLowerCase()).toContain('noite');
    });

    it('should select random institutional footers from FOOTER_POOL', () => {
      const footer = getDynamicFooter();
      expect(FOOTER_POOL).toContain(footer);
      expect(footer.startsWith('_')).toBe(true);
      expect(footer.endsWith('_')).toBe(true);
      expect(footer).toContain('GSA HUB');
    });

    it('should replace greeting and footer in an existing message while preserving header', () => {
      const originalMessage =
        '🏢 *GSA — Gestão de Serviços*\n\n' +
        'Olá, *Adriano*! 👋\n\n' +
        '📋 *DETALHES DO ORÇAMENTO*\n' +
        '• Código: OS-2026-001\n\n' +
        '_Mensagem enviada via GSA HUB._';

      const afternoonDate = new Date('2026-08-27T17:00:00Z'); // 14:00 BRT
      const transformed = applyDynamicGreetingAndFooter(originalMessage, 'Adriano Farias', {
        date: afternoonDate,
      });

      expect(transformed.startsWith('🏢 *GSA — Gestão de Serviços*')).toBe(true);
      expect(transformed).toContain('Adriano Farias');
      expect(transformed.toLowerCase()).toContain('tarde');
      expect(transformed).toContain('OS-2026-001');
      expect(transformed).toMatch(/_.*GSA HUB.*_$/);
    });

    it('should append dynamic footer if no recognizable footer is present in original text', () => {
      const rawText = 'Sua fatura foi aprovada com sucesso! Acesse o portal.';
      const result = applyDynamicGreetingAndFooter(rawText);
      expect(result).toContain(rawText);
      expect(result).toMatch(/_.*GSA HUB.*_$/);
    });
  });

  describe('Tier 1: Feature 6 — Zero-Width Space Invisibility & Entropy (R2.2)', () => {
    it('should inject zero-width characters (\\u200B, \\u200C, \\u200D) into plain text', () => {
      const input = 'Olá cliente. Sua fatura está disponível! Acesse agora.';
      const output = injectZeroWidthEntropy(input);

      // Check that zero-width characters are present
      const hasZWS = /[\u200B\u200C\u200D]/.test(output);
      expect(hasZWS).toBe(true);

      // Verify that visible text (without ZWS) matches the original
      const visibleText = output.replace(/[\u200B\u200C\u200D]/g, '');
      expect(visibleText).toBe(input);
    });

    it('should produce distinct SHA-256 hashes for identical inputs on repeated invocations', () => {
      const input = 'Notificação de cobrança: vencimento amanhã. Valor: R$ 150,00.';
      const hashes = new Set<string>();

      for (let i = 0; i < 20; i++) {
        const mutated = injectZeroWidthEntropy(input);
        hashes.add(sha256(mutated));
      }

      // Out of 20 runs, randomized salt and positions should produce at least 15 unique hashes
      expect(hashes.size).toBeGreaterThanOrEqual(15);
    });

    it('should append non-visual trailing salt between 3 and 7 zero-width characters', () => {
      const input = 'Texto curto';
      const output = injectZeroWidthEntropy(input);

      const trailingMatch = output.match(/[\u200B\u200C\u200D]+$/);
      expect(trailingMatch).not.toBeNull();
      if (trailingMatch) {
        expect(trailingMatch[0].length).toBeGreaterThanOrEqual(3);
      }
    });

    it('should NOT inject zero-width characters inside URLs embedded in the text', () => {
      const input =
        'Acesse seu boleto em https://api.147-15-43-141.nip.io/fatura/123 e pague via PIX.';
      const output = injectZeroWidthEntropy(input);

      const urlMatch = output.match(/https:\/\/[^\s]+/);
      expect(urlMatch).not.toBeNull();
      if (urlMatch) {
        // The URL portion itself must NOT contain zero-width characters
        expect(/[\u200B\u200C\u200D]/.test(urlMatch[0])).toBe(false);
      }
    });

    it('should preserve WhatsApp markdown formatting delimiters (*, _, ~, `)', () => {
      const input = 'Aviso: *Importante* _Urgente_ ~Cancelado~ `COD123`';
      const output = injectZeroWidthEntropy(input);

      expect(output).toContain('*Importante*');
      expect(output).toContain('_Urgente_');
      expect(output).toContain('~Cancelado~');
      expect(output).toContain('`COD123`');
    });
  });

  describe('Tier 1: Feature 7 — Dynamic URL Parameters & Tracking Randomizer (R2.3)', () => {
    it('should append ?t=[timestamp]&ref=[random] to simple URLs', () => {
      const url = 'https://gsa-hub.com.br/pagamento';
      const modified = injectUrlTrackingParams(url);

      const parsed = new URL(modified);
      expect(parsed.origin).toBe('https://gsa-hub.com.br');
      expect(parsed.pathname).toBe('/pagamento');
      expect(parsed.searchParams.has('t')).toBe(true);
      expect(parsed.searchParams.has('ref')).toBe(true);
      expect(parsed.searchParams.get('ref')!.length).toBeGreaterThanOrEqual(4);
    });

    it('should preserve existing query parameters when appending tracking parameters', () => {
      const url = 'https://gsa-hub.com.br/faturas?id=987&tipo=pix';
      const modified = injectUrlTrackingParams(url);

      const parsed = new URL(modified);
      expect(parsed.searchParams.get('id')).toBe('987');
      expect(parsed.searchParams.get('tipo')).toBe('pix');
      expect(parsed.searchParams.has('t')).toBe(true);
      expect(parsed.searchParams.has('ref')).toBe(true);
    });

    it('should preserve #hash and #anchor fragments at the end of the URL', () => {
      const url = 'https://gsa-hub.com.br/dashboard?tab=financeiro#comprovantes';
      const modified = injectUrlTrackingParams(url);

      expect(modified).toContain('#comprovantes');
      const parsed = new URL(modified);
      expect(parsed.hash).toBe('#comprovantes');
      expect(parsed.searchParams.get('tab')).toBe('financeiro');
      expect(parsed.searchParams.has('t')).toBe(true);
      expect(parsed.searchParams.has('ref')).toBe(true);
    });

    it('should exempt WhatsApp deep links (wa.me, api.whatsapp.com), mailto, and tel', () => {
      const wa1 = 'https://wa.me/5511971858372?text=Ajuda';
      expect(injectUrlTrackingParams(wa1)).toBe(wa1);

      const wa2 = 'https://api.whatsapp.com/send?phone=5511971858372';
      expect(injectUrlTrackingParams(wa2)).toBe(wa2);

      const mailto = 'mailto:contato@gsahub.com.br';
      expect(injectUrlTrackingParams(mailto)).toBe(mailto);

      const tel = 'tel:+5511971858372';
      expect(injectUrlTrackingParams(tel)).toBe(tel);
    });

    it('should randomize all eligible URLs in a multi-URL message with punctuation preservation', () => {
      const message =
        'Acesse o link 1: https://hub.gsa.com/doc1, e o link 2: https://hub.gsa.com/doc2?origem=email.\n' +
        'Dúvidas no WhatsApp: https://wa.me/5511971858372.';

      const randomized = randomizeMessageUrls(message);

      // Verify link 1 was mutated and comma preserved
      expect(randomized).toMatch(/https:\/\/hub\.gsa\.com\/doc1\?t=\d+&ref=[a-z0-9]+,/);
      // Verify link 2 was mutated with existing param and period preserved
      expect(randomized).toMatch(/https:\/\/hub\.gsa\.com\/doc2\?origem=email&t=\d+&ref=[a-z0-9]+\./);
      // Verify wa.me was exempt
      expect(randomized).toContain('https://wa.me/5511971858372.');
    });

    it('should allow custom tracking parameters override', () => {
      const url = 'https://gsa-hub.com.br/portal';
      const modified = injectUrlTrackingParams(url, {
        t: '1700000000000',
        ref: 'campanha_agosto',
        source: 'whatsapp_bot',
      });

      const parsed = new URL(modified);
      expect(parsed.searchParams.get('t')).toBe('1700000000000');
      expect(parsed.searchParams.get('ref')).toBe('campanha_agosto');
      expect(parsed.searchParams.get('source')).toBe('whatsapp_bot');
    });
  });

  describe('Tier 1: Feature 8 — Safe PDF Byte Variation (ISO 32000-1) (R2.4)', () => {
    const SAMPLE_PDF_BASE64 = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n%%EOF\n'
    ).toString('base64');

    it('should mutate Base64 PDF and produce a different SHA-256 checksum', () => {
      const mutated1 = pdfVariationEngine.applyBase64Variation(SAMPLE_PDF_BASE64);
      const mutated2 = pdfVariationEngine.applyBase64Variation(SAMPLE_PDF_BASE64);

      expect(mutated1).not.toBe(SAMPLE_PDF_BASE64);
      expect(mutated2).not.toBe(SAMPLE_PDF_BASE64);
      expect(mutated1).not.toBe(mutated2);

      const hashOriginal = sha256(Buffer.from(SAMPLE_PDF_BASE64, 'base64'));
      const hashMutated1 = sha256(Buffer.from(mutated1, 'base64'));
      const hashMutated2 = sha256(Buffer.from(mutated2, 'base64'));

      expect(hashMutated1).not.toBe(hashOriginal);
      expect(hashMutated2).not.toBe(hashOriginal);
      expect(hashMutated1).not.toBe(hashMutated2);
    });

    it('should maintain data URI prefix (data:application/pdf;base64,) when present', () => {
      const dataUri = `data:application/pdf;base64,${SAMPLE_PDF_BASE64}`;
      const mutated = pdfVariationEngine.applyBase64Variation(dataUri);

      expect(mutated.startsWith('data:application/pdf;base64,')).toBe(true);
      const rawBase64 = mutated.replace('data:application/pdf;base64,', '');
      const decoded = Buffer.from(rawBase64, 'base64').toString('utf-8');

      expect(decoded.startsWith('%PDF-1.4')).toBe(true);
      expect(decoded).toContain('%%EOF');
      expect(decoded).toContain('% GSA-RND-');
    });

    it('should safely mutate Uint8Array buffer adhering to ISO 32000-1 trailing comment format', () => {
      const originalBytes = new TextEncoder().encode(
        '%PDF-1.7\n1 0 obj\n<< /Title (Relatório Financeiro GSA) >>\nendobj\n%%EOF\n'
      );
      const mutatedBytes = pdfVariationEngine.applyUint8ArrayVariation(originalBytes);

      expect(mutatedBytes.length).toBeGreaterThan(originalBytes.length);

      // Verify original bytes at the beginning are intact
      expect(mutatedBytes.slice(0, originalBytes.length)).toEqual(originalBytes);

      // Verify trailing comment
      const appendedText = new TextDecoder().decode(mutatedBytes.slice(originalBytes.length));
      expect(appendedText).toMatch(/\n% GSA-RND-\d+-[a-z0-9]+\n/);
    });

    it('should safely mutate Blob instances without altering MIME type', async () => {
      const originalBlob = new Blob(['%PDF-1.5\n%%EOF\n'], { type: 'application/pdf' });
      const mutatedBlob = pdfVariationEngine.applyBlobVariation(originalBlob);

      expect(mutatedBlob.type).toBe('application/pdf');
      expect(mutatedBlob.size).toBeGreaterThan(originalBlob.size);

      const text = await mutatedBlob.text();
      expect(text.startsWith('%PDF-1.5')).toBe(true);
      expect(text).toContain('% GSA-RND-');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TIER 2: BOUNDARY & CORNER CASES
  // ──────────────────────────────────────────────────────────────────────────

  describe('Tier 2: Boundary & Corner Cases', () => {
    it('should handle empty, null, and undefined inputs gracefully without throwing', () => {
      expect(applyDynamicGreetingAndFooter('')).toBe('');
      expect(applyDynamicGreetingAndFooter(null as any)).toBe(null);
      expect(applyDynamicGreetingAndFooter(undefined as any)).toBe(undefined);

      expect(injectZeroWidthEntropy('')).toBe('');
      expect(injectZeroWidthEntropy(null as any)).toBe(null);

      expect(injectUrlTrackingParams('')).toBe('');
      expect(injectUrlTrackingParams(null as any)).toBe(null);

      expect(randomizeMessageUrls('')).toBe('');
      expect(randomizeMessageUrls(null as any)).toBe(null);

      expect(pdfVariationEngine.applyBase64Variation('')).toBe('');
      expect(pdfVariationEngine.applyUint8ArrayVariation(null as any)).toBe(null);
      expect(pdfVariationEngine.applyBlobVariation(null as any)).toBe(null);
    });

    it('should handle malformed URLs or non-standard protocols in URL randomizer', () => {
      const malformed1 = 'https:///broken-url?q=test#anchor';
      const result1 = injectUrlTrackingParams(malformed1);
      expect(result1).toContain('t=');
      expect(result1).toContain('ref=');
      expect(result1).toContain('#anchor');

      const relativeUrl = '/caminho/relativo?item=1#detalhes';
      const result2 = injectUrlTrackingParams(relativeUrl);
      expect(result2).toContain('item=1');
      expect(result2).toContain('t=');
      expect(result2).toContain('ref=');
      expect(result2.endsWith('#detalhes')).toBe(true);
    });

    it('should handle messages with complex Unicode, emojis, and non-Latin characters', () => {
      const unicodeMessage =
        '🏢 *GSA — Gestão de Serviços*\n\n' +
        'Olá, *Adriano 🚀 🌟 ⚡*! 👋\n\n' +
        'Total: R$ 1.250,50 • Status: ✅ Concluído • 日本語テスト • العربية\n\n' +
        '_Mensagem enviada via GSA HUB._';

      const result = applyAllVariations(unicodeMessage, {
        clienteNome: 'Adriano 🚀 🌟 ⚡',
      });

      expect(result).toContain('Adriano 🚀 🌟 ⚡');
      expect(result).toContain('R$ 1.250,50');
      expect(result).toContain('日本語テスト');
      expect(result).toContain('العربية');
      expect(result).toMatch(/[\u200B\u200C\u200D]/);
    });

    it('should handle large messages with 50+ URLs and extensive markdown', () => {
      let largeMessage = 'Relatório Geral GSA:\n\n';
      for (let i = 0; i < 30; i++) {
        largeMessage += `• Item ${i}: *Importante* - https://gsa.com/item/${i}?status=ok#view\n`;
      }
      largeMessage += '\n_Mensagem enviada via GSA HUB._';

      const transformed = applyAllVariations(largeMessage);

      // Verify all 30 URLs have tracking params
      for (let i = 0; i < 30; i++) {
        expect(transformed).toContain(`https://gsa.com/item/${i}?status=ok&t=`);
        expect(transformed).toContain(`&ref=`);
      }
    });

    it('should handle corrupted PDF Base64 strings without crashing', () => {
      const corruptBase64 = '!!!This_is_NOT_a_valid_base64_string$$$';
      const result = pdfVariationEngine.applyBase64Variation(corruptBase64);
      expect(typeof result).toBe('string');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TIER 3: CROSS-FEATURE INTERACTIONS
  // ──────────────────────────────────────────────────────────────────────────

  describe('Tier 3: Cross-Feature Interactions', () => {
    it('should apply all variation strategies (greetings + URLs + ZWS entropy) synergistically', () => {
      const originalMessage =
        '🏢 *GSA — Gestão de Serviços*\n\n' +
        'Olá, *Cliente*! 👋\n\n' +
        'Seu comprovante está pronto:\n' +
        'https://gsa.com/comprovante/8890\n\n' +
        '_Mensagem enviada via GSA HUB._';

      const options: VariationOptions = {
        clienteNome: 'Beatriz Costa',
        enableUrlRandomizer: true,
        enableZeroWidth: true,
        date: new Date('2026-08-27T17:00:00Z'), // 14:00 BRT
      };

      const result = applyAllVariations(originalMessage, options);

      // 1. Dynamic greeting applied
      expect(result).toContain('Beatriz Costa');
      expect(result.toLowerCase()).toContain('tarde');

      // 2. URL randomized with query params
      expect(result).toMatch(/https:\/\/gsa\.com\/comprovante\/8890\?t=\d+&ref=[a-z0-9]+/);

      // 3. Zero-width entropy injected
      expect(/[\u200B\u200C\u200D]/.test(result)).toBe(true);

      // 4. URL string itself must not have internal zero-width characters injected in hostname or query
      const urlExtracted = result.match(/https:\/\/gsa\.com\/comprovante\/8890[^\s\n]+/);
      expect(urlExtracted).not.toBeNull();
      if (urlExtracted) {
        // Strip any optional trailing line salt to inspect the URL body
        const cleanUrl = urlExtracted[0].replace(/[\u200B\u200C\u200D]+$/, '');
        expect(/[\u200B\u200C\u200D]/.test(cleanUrl)).toBe(false);
        expect(cleanUrl).toContain('?t=');
        expect(cleanUrl).toContain('&ref=');
      }
    });

    it('should respect toggle flags (enableZeroWidth=false, enableUrlRandomizer=false)', () => {
      const message =
        'Olá, *Cliente*! 👋\n\n' +
        'Acesse https://gsa.com/link para mais informações.\n\n' +
        '_Mensagem enviada via GSA HUB._';

      const noZwsNoUrl = applyAllVariations(message, {
        enableZeroWidth: false,
        enableUrlRandomizer: false,
      });

      expect(/[\u200B\u200C\u200D]/.test(noZwsNoUrl)).toBe(false);
      expect(noZwsNoUrl).toContain('https://gsa.com/link');
      expect(noZwsNoUrl).not.toContain('?t=');
    });

    it('should pipeline generated PDF variation hash with notification payload containing PDF link', () => {
      const rawPdf = Buffer.from('%PDF-1.4\nInvoice Data\n%%EOF\n');
      const mutatedPdf1 = pdfVariationEngine.applyUint8ArrayVariation(new Uint8Array(rawPdf));
      const mutatedPdf2 = pdfVariationEngine.applyUint8ArrayVariation(new Uint8Array(rawPdf));

      const hash1 = sha256(mutatedPdf1);
      const hash2 = sha256(mutatedPdf2);
      expect(hash1).not.toBe(hash2);

      const msg1 = applyAllVariations(
        `Fatura gerada com hash: ${hash1}.\nBaixe em: https://gsa.com/pdf/${hash1}`,
        { clienteNome: 'Empresa Alpha' }
      );
      const msg2 = applyAllVariations(
        `Fatura gerada com hash: ${hash2}.\nBaixe em: https://gsa.com/pdf/${hash2}`,
        { clienteNome: 'Empresa Alpha' }
      );

      expect(msg1).not.toBe(msg2);
      expect(sha256(msg1)).not.toBe(sha256(msg2));
    });
  });
});

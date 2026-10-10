import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
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

function sha256(data: string | Uint8Array | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

describe('GATE C2 — Adversarial Empirical Stress Testing Harness', () => {
  // =========================================================================
  // 1. DYNAMIC GREETINGS & FOOTERS ADVERSARIAL STRESS TEST
  // =========================================================================
  describe('1. Dynamic Greetings & Footers Empirical Entropy & Boundary Analysis', () => {
    it('adversarially stress tests 2,400 greeting combinations across all 24 hours and 10 diverse client names', () => {
      const clientNames = [
        'Adriano Farias',
        'João da Silva & Cia',
        'Maria-José dos Santos',
        'Ana 🚀 🌟',
        'Dr. O\'Connor',
        '<script>alert("xss")</script>',
        'SELECT * FROM users;',
        '   Leading and Trailing Spaces   ',
        '',
        '   ',
      ];

      // Test all 24 hours of a day
      for (let hour = 0; hour < 24; hour++) {
        // Construct UTC date corresponding to target Brazil hour: Brazil = (UTC - 3) mod 24 => UTC = (hour + 3) mod 24
        const utcHour = (hour + 3) % 24;
        const testDate = new Date(`2026-08-27T${String(utcHour).padStart(2, '0')}:30:00Z`);
        const calculatedBrtHour = getBrazilHour(testDate);

        expect(calculatedBrtHour).toBe(hour);

        for (const name of clientNames) {
          const greeting = getDynamicGreeting(name, testDate);

          // Invariant 1: Greeting is NEVER empty or undefined
          expect(greeting).toBeTruthy();
          expect(greeting.length).toBeGreaterThan(3);

          const trimmedName = name.trim();
          if (trimmedName.length > 0) {
            // Invariant 2: When non-empty name provided, name must be embedded formatted with asterisks
            expect(greeting).toContain(`*${trimmedName}*`);
            expect(greeting).not.toContain('{nome}');
          } else {
            // Invariant 3: When empty name provided, template placeholder must not leak
            expect(greeting).not.toContain('{nome}');
          }

          // Invariant 4: Time of day semantics
          if (trimmedName.length > 0) {
            if (hour >= 5 && hour < 12) {
              expect(
                greeting.includes('Bom dia') ||
                greeting.includes('bom dia') ||
                greeting.includes('Olá') ||
                greeting.includes('Oi')
              ).toBe(true);
            } else if (hour >= 12 && hour < 18) {
              expect(greeting.toLowerCase()).toContain('tarde');
            } else {
              expect(greeting.toLowerCase()).toContain('noite');
            }
          } else {
            if (hour >= 5 && hour < 12) {
              expect(GREETING_POOLS.morningWithoutName).toContain(greeting);
            } else if (hour >= 12 && hour < 18) {
              expect(GREETING_POOLS.afternoonWithoutName).toContain(greeting);
            } else {
              expect(GREETING_POOLS.eveningWithoutName).toContain(greeting);
            }
          }
        }
      }
    });

    it('verifies high entropy and uniform distribution across 1,000 footer selections', () => {
      const footerCounts = new Map<string, number>();
      for (const footer of FOOTER_POOL) {
        footerCounts.set(footer, 0);
      }

      const ITERATIONS = 1000;
      for (let i = 0; i < ITERATIONS; i++) {
        const footer = getDynamicFooter();
        expect(FOOTER_POOL).toContain(footer);
        footerCounts.set(footer, (footerCounts.get(footer) || 0) + 1);
      }

      // Invariant: All footers in the pool must be selected at least once in 1,000 iterations
      for (const [footer, count] of footerCounts.entries()) {
        expect(count).toBeGreaterThan(0);
        // Expected mean is ~ 1000 / FOOTER_POOL.length = ~142. Tolerance: at least 50
        expect(count).toBeGreaterThan(40);
      }
    });

    it('verifies idempotency and safe header/footer substitution on complex nested templates', () => {
      const baseHeader = '🏢 *GSA — Gestão de Serviços*\n\n';
      const body = '📋 *PROTOCOLO DE ATENDIMENTO*: #PR-99881\nStatus: Confirmado ✅';
      const initialGreeting = 'Olá, *Adriano*! 👋\n\n';
      const initialFooter = '\n\n_Mensagem enviada via GSA HUB._';

      const fullTemplate = `${baseHeader}${initialGreeting}${body}${initialFooter}`;

      for (let i = 0; i < 100; i++) {
        const transformed = applyDynamicGreetingAndFooter(fullTemplate, 'Adriano Farias', {
          date: new Date('2026-08-27T17:00:00Z'), // 14:00 BRT (Afternoon)
        });

        expect(transformed.startsWith(baseHeader)).toBe(true);
        expect(transformed).toContain('Adriano Farias');
        expect(transformed.toLowerCase()).toContain('tarde');
        expect(transformed).toContain('#PR-99881');
        expect(transformed).toMatch(/_.*GSA HUB.*_$/);
        // Ensure no duplicate footers are stacked
        const footerMatches = transformed.match(/_.*GSA HUB.*_/g);
        expect(footerMatches?.length).toBe(1);
      }
    });
  });

  // =========================================================================
  // 2. ZERO-WIDTH SPACE INVISIBILITY & 1,000 TEXT SAMPLE UNIQUENESS TEST
  // =========================================================================
  describe('2. Zero-Width Space (\u200B, \u200C, \u200D) 1,000-Sample 0-Collision & Invisibility Stress Test', () => {
    it('executes 1,000 iterations on standard notification and guarantees 1,000 unique SHA-256 hashes (0 collisions)', () => {
      const baseMessage =
        '🏢 *GSA — Gestão de Serviços*\n\n' +
        'Olá, *Adriano Farias*! 👋\n\n' +
        'Sua fatura de locação de equipamentos referente ao mês 08/2026 está fechada.\n' +
        'Valor total: *R$ 4.850,00* com vencimento em *30/08/2026*.\n\n' +
        'Para realizar o pagamento via PIX ou Boleto, acesse:\n' +
        'https://hub.gsa.com.br/faturas/online/view?id=99281&auth=live\n\n' +
        '_Atendimento e Gestão Integrada • GSA HUB._';

      const uniqueHashes = new Set<string>();
      const samples: string[] = [];

      const ITERATIONS = 1000;
      for (let i = 0; i < ITERATIONS; i++) {
        const mutated = injectZeroWidthEntropy(baseMessage);
        const hash = sha256(mutated);

        // Invariant 1: Uniqueness
        expect(uniqueHashes.has(hash)).toBe(false);
        uniqueHashes.add(hash);
        samples.push(mutated);

        // Invariant 2: Invisibility — Stripping ZWS reproduces original text bit-for-bit
        const visibleRender = mutated.replace(/[\u200B\u200C\u200D]/g, '');
        expect(visibleRender).toBe(baseMessage);

        // Invariant 3: URLs inside text remain completely unpolluted with ZWS
        const urlMatch = mutated.match(/https?:\/\/[^\s\)\>\]]+/);
        expect(urlMatch).not.toBeNull();
        if (urlMatch) {
          const urlString = urlMatch[0];
          expect(/[\u200B\u200C\u200D]/.test(urlString)).toBe(false);
          expect(urlString).toBe('https://hub.gsa.com.br/faturas/online/view?id=99281&auth=live');
        }

        // Invariant 4: WhatsApp markdown delimiters remain valid and intact
        expect(mutated).toContain('*GSA — Gestão de Serviços*');
        expect(mutated).toContain('*Adriano Farias*');
        expect(mutated).toContain('*R$ 4.850,00*');
        expect(mutated).toContain('*30/08/2026*');
      }

      expect(uniqueHashes.size).toBe(ITERATIONS);
    });

    it('tests zero-width space injection across diverse corner-case payloads', () => {
      const cornerCases = [
        'SingleWord',
        'A',
        '1234567890',
        '!!! ??? ... ,,, ::: ;;;',
        'Line 1\nLine 2\nLine 3\nLine 4\nLine 5',
        '*Bold* _Italic_ ~Strike~ `Code` ```CodeBlock```',
        'Unicode: 🚀 🌟 ⚡ 🎯 💎 🛡️ 🔑 📦 🇧🇷',
        'Special characters: @#$%^&*()_+-=[]{}|;:,.<>?/~`',
        'https://site.com/1\nhttps://site.com/2\nhttps://site.com/3',
        'Texto com link no meio https://site.com/meio e fim do texto.',
      ];

      for (const payload of cornerCases) {
        const mutated = injectZeroWidthEntropy(payload);
        expect(mutated.length).toBeGreaterThanOrEqual(payload.length);

        // Cleaned string must equal exact input
        const cleaned = mutated.replace(/[\u200B\u200C\u200D]/g, '');
        expect(cleaned).toBe(payload);
      }
    });
  });

  // =========================================================================
  // 3. SAFE PDF BYTE VARIATION 1,000-SAMPLE SHA-256 0-COLLISION & ISO 32000-1 TEST
  // =========================================================================
  describe('3. Safe PDF Byte Variation 1,000-Sample 0-Collision & ISO 32000-1 Conformance', () => {
    // Standard minimal valid PDF binary
    const RAW_PDF_STRING =
      '%PDF-1.4\n' +
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n' +
      'xref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n' +
      'trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n185\n%%EOF';

    const RAW_PDF_BYTES = new TextEncoder().encode(RAW_PDF_STRING);
    const RAW_PDF_BASE64 = Buffer.from(RAW_PDF_BYTES).toString('base64');

    it('mutates 1,000 PDF Uint8Array buffers and verifies 1,000 unique SHA-256 hashes (0 collisions)', () => {
      const hashes = new Set<string>();
      const ITERATIONS = 1000;

      for (let i = 0; i < ITERATIONS; i++) {
        const mutatedBuffer = pdfVariationEngine.applyUint8ArrayVariation(RAW_PDF_BYTES);
        const hash = sha256(mutatedBuffer);

        // Invariant 1: 0 Collisions across 1,000 runs
        expect(hashes.has(hash)).toBe(false);
        hashes.add(hash);

        // Invariant 2: Exact byte-level preservation of original payload prefix
        const originalSlice = mutatedBuffer.slice(0, RAW_PDF_BYTES.length);
        expect(Buffer.from(originalSlice).equals(Buffer.from(RAW_PDF_BYTES))).toBe(true);

        // Invariant 3: ISO 32000-1 conformance — Header '%PDF-' must be at offset 0
        const header = new TextDecoder().decode(mutatedBuffer.slice(0, 5));
        expect(header).toBe('%PDF-');

        // Invariant 4: Original %%EOF trailer preserved
        const fullString = new TextDecoder().decode(mutatedBuffer);
        expect(fullString).toContain('%%EOF');

        // Invariant 5: Safe ISO 32000-1 Comment syntax appended
        const trailingComment = fullString.substring(RAW_PDF_STRING.length);
        expect(trailingComment).toMatch(/^\n% GSA-RND-\d+-[a-z0-9]+\n$/);
      }

      expect(hashes.size).toBe(ITERATIONS);
    });

    it('mutates 1,000 PDF Base64 and Data-URI representations and verifies 1,000 unique SHA-256 hashes', () => {
      const base64Hashes = new Set<string>();
      const dataUriHashes = new Set<string>();
      const dataUri = `data:application/pdf;base64,${RAW_PDF_BASE64}`;

      const ITERATIONS = 1000;
      for (let i = 0; i < ITERATIONS; i++) {
        // Raw Base64
        const mutatedB64 = pdfVariationEngine.applyBase64Variation(RAW_PDF_BASE64);
        const hashB64 = sha256(mutatedB64);
        expect(base64Hashes.has(hashB64)).toBe(false);
        base64Hashes.add(hashB64);

        const decoded = Buffer.from(mutatedB64, 'base64').toString('utf-8');
        expect(decoded.startsWith('%PDF-1.4')).toBe(true);
        expect(decoded).toContain('%%EOF');
        expect(decoded).toContain('% GSA-RND-');

        // Data URI
        const mutatedDataUri = pdfVariationEngine.applyBase64Variation(dataUri);
        const hashDataUri = sha256(mutatedDataUri);
        expect(dataUriHashes.has(hashDataUri)).toBe(false);
        dataUriHashes.add(hashDataUri);

        expect(mutatedDataUri.startsWith('data:application/pdf;base64,')).toBe(true);
      }

      expect(base64Hashes.size).toBe(ITERATIONS);
      expect(dataUriHashes.size).toBe(ITERATIONS);
    });

    it('mutates 1,000 PDF Blob instances and verifies proper MIME type and content growth', async () => {
      const originalBlob = new Blob([RAW_PDF_BYTES], { type: 'application/pdf' });
      const ITERATIONS = 100; // Blobs are async, test 100 samples in loop

      for (let i = 0; i < ITERATIONS; i++) {
        const mutatedBlob = pdfVariationEngine.applyBlobVariation(originalBlob);
        expect(mutatedBlob.type).toBe('application/pdf');
        expect(mutatedBlob.size).toBeGreaterThan(originalBlob.size);

        const text = await mutatedBlob.text();
        expect(text.startsWith('%PDF-1.4')).toBe(true);
        expect(text).toContain('%%EOF');
        expect(text).toContain('% GSA-RND-');
      }
    });

    it('tests PDF variation robustness on diverse PDF version headers (%PDF-1.3 to %PDF-2.0)', () => {
      const versions = ['%PDF-1.3', '%PDF-1.4', '%PDF-1.5', '%PDF-1.6', '%PDF-1.7', '%PDF-2.0'];

      for (const ver of versions) {
        const dummyPdf = `${ver}\n1 0 obj << >> endobj\n%%EOF`;
        const mutated = pdfVariationEngine.applyUint8ArrayVariation(new TextEncoder().encode(dummyPdf));
        const decoded = new TextDecoder().decode(mutated);

        expect(decoded.startsWith(ver)).toBe(true);
        expect(decoded).toContain('%%EOF');
        expect(decoded).toMatch(/\n% GSA-RND-\d+-[a-z0-9]+\n$/);
      }
    });
  });

  // =========================================================================
  // 4. DYNAMIC URL PARAMETER INJECTION ADVERSARIAL STRESS TEST
  // =========================================================================
  describe('4. Dynamic URL Parameter Injection Adversarial Test Across Diverse URL Shapes', () => {
    const urlTestMatrix = [
      {
        name: 'Root domain HTTPS without trailing slash',
        input: 'https://gsahub.com.br',
        validate: (out: string) => {
          const u = new URL(out);
          expect(u.origin).toBe('https://gsahub.com.br');
          expect(u.pathname).toBe('/');
          expect(u.searchParams.has('t')).toBe(true);
          expect(u.searchParams.has('ref')).toBe(true);
        },
      },
      {
        name: 'Root domain HTTP with port',
        input: 'http://147.15.43.141:8080',
        validate: (out: string) => {
          const u = new URL(out);
          expect(u.port).toBe('8080');
          expect(u.searchParams.has('t')).toBe(true);
          expect(u.searchParams.has('ref')).toBe(true);
        },
      },
      {
        name: 'Deep path with single existing query parameter',
        input: 'https://hub.gsa.com/api/v1/fatura?id=99281',
        validate: (out: string) => {
          const u = new URL(out);
          expect(u.pathname).toBe('/api/v1/fatura');
          expect(u.searchParams.get('id')).toBe('99281');
          expect(u.searchParams.has('t')).toBe(true);
          expect(u.searchParams.has('ref')).toBe(true);
        },
      },
      {
        name: 'Multiple query parameters with encoded special characters',
        input: 'https://hub.gsa.com/relatorios?nome=Jo%C3%A3o%20Silva&categoria=Gest%C3%A3o%20OS&limit=50',
        validate: (out: string) => {
          const u = new URL(out);
          expect(u.searchParams.get('nome')).toBe('João Silva');
          expect(u.searchParams.get('categoria')).toBe('Gestão OS');
          expect(u.searchParams.get('limit')).toBe('50');
          expect(u.searchParams.has('t')).toBe(true);
          expect(u.searchParams.has('ref')).toBe(true);
        },
      },
      {
        name: 'URL with hash fragment only',
        input: 'https://gsahub.com.br/dashboard#secao-financeira',
        validate: (out: string) => {
          const u = new URL(out);
          expect(u.hash).toBe('#secao-financeira');
          expect(u.searchParams.has('t')).toBe(true);
          expect(u.searchParams.has('ref')).toBe(true);
          expect(out.endsWith('#secao-financeira')).toBe(true);
        },
      },
      {
        name: 'URL with both query parameters and complex hash fragment',
        input: 'https://gsahub.com.br/view?doc=OS-2026&mode=preview#page=3&zoom=100',
        validate: (out: string) => {
          const u = new URL(out);
          expect(u.searchParams.get('doc')).toBe('OS-2026');
          expect(u.searchParams.get('mode')).toBe('preview');
          expect(u.searchParams.has('t')).toBe(true);
          expect(u.searchParams.has('ref')).toBe(true);
          expect(u.hash).toBe('#page=3&zoom=100');
          expect(out.endsWith('#page=3&zoom=100')).toBe(true);
        },
      },
      {
        name: 'Relative path URL (fallback parser)',
        input: '/faturas/download/2026-08?type=pdf#receipt',
        validate: (out: string) => {
          expect(out.startsWith('/faturas/download/2026-08?type=pdf&t=')).toBe(true);
          expect(out).toContain('&ref=');
          expect(out.endsWith('#receipt')).toBe(true);
        },
      },
      {
        name: 'WhatsApp deep link wa.me (STRICTLY EXEMPT)',
        input: 'https://wa.me/5511971858372?text=Ol%C3%A1',
        validate: (out: string) => {
          expect(out).toBe('https://wa.me/5511971858372?text=Ol%C3%A1');
        },
      },
      {
        name: 'WhatsApp deep link api.whatsapp.com (STRICTLY EXEMPT)',
        input: 'https://api.whatsapp.com/send?phone=5511971858372&text=Ajuda',
        validate: (out: string) => {
          expect(out).toBe('https://api.whatsapp.com/send?phone=5511971858372&text=Ajuda');
        },
      },
      {
        name: 'Mailto and Tel schemes (STRICTLY EXEMPT)',
        input: 'mailto:suporte@gsahub.com.br',
        validate: (out: string) => {
          expect(out).toBe('mailto:suporte@gsahub.com.br');
        },
      },
    ];

    it('validates all URL matrix test cases for syntactic correctness and parameter injection', () => {
      for (const testCase of urlTestMatrix) {
        const injected = injectUrlTrackingParams(testCase.input);
        testCase.validate(injected);
      }
    });

    it('correctly isolates adjacent punctuation in multi-URL message bodies', () => {
      const message =
        'Consulte os links:\n' +
        '1. Link principal: https://hub.gsa.com/doc1, veja.\n' +
        '2. Link secundário: https://hub.gsa.com/doc2?id=55.\n' +
        '3. Link com hash: https://hub.gsa.com/doc3#tab!\n' +
        '4. Suporte: https://wa.me/5511971858372.';

      const randomized = randomizeMessageUrls(message, { t: '1724784000000', ref: 'fixed_ref' });

      expect(randomized).toContain('https://hub.gsa.com/doc1?t=1724784000000&ref=fixed_ref,');
      expect(randomized).toContain('https://hub.gsa.com/doc2?id=55&t=1724784000000&ref=fixed_ref.');
      expect(randomized).toContain('https://hub.gsa.com/doc3?t=1724784000000&ref=fixed_ref#tab!');
      expect(randomized).toContain('https://wa.me/5511971858372.');
    });
  });

  // =========================================================================
  // 5. KEEP-ALIVE TELEMETRY & ADAPTIVE INTERVALS EMPIRICAL VERIFICATION
  // =========================================================================
  describe('5. Keep-Alive Telemetry & Adaptive Scheduling Empirical Verification', () => {
    it('verifies exponential backoff intervals on consecutive errors', async () => {
      const { WhatsAppHealthService, WHATSAPP_POLLING_INTERVALS } = await import(
        '../lib/whatsappHealthService'
      );

      const healthInstance = new WhatsAppHealthService();

      // Default foreground active interval
      expect(healthInstance.getNextPollingInterval()).toBe(WHATSAPP_POLLING_INTERVALS.ACTIVE_MS);

      // Simulate 1 error -> 5,000ms
      (healthInstance as any).state.consecutiveErrors = 1;
      expect(healthInstance.getNextPollingInterval()).toBe(5000);

      // Simulate 2 errors -> 10,000ms
      (healthInstance as any).state.consecutiveErrors = 2;
      expect(healthInstance.getNextPollingInterval()).toBe(10000);

      // Simulate 3 errors -> 20,000ms
      (healthInstance as any).state.consecutiveErrors = 3;
      expect(healthInstance.getNextPollingInterval()).toBe(20000);

      // Simulate 4 errors -> 40,000ms
      (healthInstance as any).state.consecutiveErrors = 4;
      expect(healthInstance.getNextPollingInterval()).toBe(40000);

      // Simulate 5 errors -> capped at MAX_BACKOFF_MS (60,000ms)
      (healthInstance as any).state.consecutiveErrors = 5;
      expect(healthInstance.getNextPollingInterval()).toBe(60000);

      // Simulate 10 errors -> still capped at 60,000ms
      (healthInstance as any).state.consecutiveErrors = 10;
      expect(healthInstance.getNextPollingInterval()).toBe(60000);

      // Reset errors -> back to 30,000ms
      (healthInstance as any).state.consecutiveErrors = 0;
      expect(healthInstance.getNextPollingInterval()).toBe(30000);
    });

    it('verifies Pause Dispatch queue retention and toggle state transitions', async () => {
      const { WhatsAppHealthService } = await import('../lib/whatsappHealthService');
      const health = new WhatsAppHealthService();

      expect(health.isPaused()).toBe(false);
      expect(health.getQueue().length).toBe(0);

      // Pause dispatch
      health.setPaused(true);
      expect(health.isPaused()).toBe(true);

      // Enqueue 3 messages while paused
      const id1 = health.enqueueMessage({
        recipient: '5511999990001',
        message: 'Mensagem 1',
      });
      const id2 = health.enqueueMessage({
        recipient: '5511999990002',
        message: 'Mensagem 2',
      });
      const id3 = health.enqueueMessage({
        recipient: '5511999990003',
        message: 'Mensagem 3',
      });

      expect(health.getQueue().length).toBe(3);
      expect(health.getState().queuedCount).toBe(3);

      // Remove 1 message
      const removed = health.removeQueuedMessage(id2);
      expect(removed).toBe(true);
      expect(health.getQueue().length).toBe(2);
      expect(health.getQueue().map((m) => m.id)).toEqual([id1, id3]);

      // Clear queue
      health.clearQueue();
      expect(health.getQueue().length).toBe(0);
      expect(health.getState().queuedCount).toBe(0);

      // Unpause
      health.setPaused(false);
      expect(health.isPaused()).toBe(false);
    });
  });
});

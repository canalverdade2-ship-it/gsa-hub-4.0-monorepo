import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hoisted mocks
const mockFrom = vi.fn();
const mockFunctionsInvoke = vi.fn();
const mockToastError = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    functions: {
      invoke: (...args: any[]) => mockFunctionsInvoke(...args),
    },
  },
  getSupabase: () => ({
    from: (...args: any[]) => mockFrom(...args),
    functions: {
      invoke: (...args: any[]) => mockFunctionsInvoke(...args),
    },
  }),
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    error: (...args: any[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

// Mock global fetch for Node environment
const originalFetch = global.fetch;

import {
  whatsappNotificationService,
  resolveWhatsAppDestination,
  type WhatsAppContext,
  type SendDirectOptions,
} from '../lib/whatsappNotificationService';
import { whatsappHealthService } from '../lib/whatsappHealthService';
import { sendAdminWhatsAppNotification } from '../utils/n8nWhatsApp';

describe('WhatsApp Notification Engine, Presence Choreography & Concurrency Test Suite (R1, R2, R3, R5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn() as any;
    whatsappHealthService.setPaused(false);
    whatsappHealthService.clearQueue();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    whatsappHealthService.setPaused(false);
    whatsappHealthService.clearQueue();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Phone Normalization & Smart Destination Routing
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Phone Normalization & Smart Destination Routing (resolveWhatsAppDestination)', () => {
    it('should format standard 10 and 11 digit Brazilian phone numbers with DDI 55 prefix', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const spMobile = await resolveWhatsAppDestination('(11) 98765-4321');
      expect(spMobile).toBe('5511987654321');

      const rjMobile = await resolveWhatsAppDestination('+55 21 99888-7777');
      expect(rjMobile).toBe('5521998887777');

      const landline = await resolveWhatsAppDestination('11 3333-4444');
      expect(landline).toBe('551133334444');
    });

    it('should keep DDI 55 prefix intact when phone already has it', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const phone = await resolveWhatsAppDestination('5511999998888');
      expect(phone).toBe('5511999998888');
    });

    it('should route Master Admin number 11971858372 to direct Baileys LID JID', async () => {
      const lid1 = await resolveWhatsAppDestination('11971858372');
      expect(lid1).toBe('38830967099420@lid');

      const lid2 = await resolveWhatsAppDestination('+55 (11) 97185-8372');
      expect(lid2).toBe('38830967099420@lid');
    });

    it('should resolve active chat remoteJid when Evolution API findChats locates matching contact', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { remoteJid: '5511988887777@s.whatsapp.net', pushName: 'Cliente Teste' },
          { remoteJid: '5521977776666@lid', pushName: 'Empresa Teste' },
        ],
      });

      const resolved = await resolveWhatsAppDestination('11988887777');
      expect(resolved).toBe('5511988887777@s.whatsapp.net');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://147.15.43.141:8080/chat/findChats/GSA_WhatsApp',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            apikey: 'gsa_hub_evolution_token_2026',
          }),
        })
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. 3-Tier Notification Fallback Cascade
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. 3-Tier Notification Fallback Cascade', () => {
    const testPhone = '11999991111';
    const testMessage = 'Olá! Esta é uma notificação de teste do GSA HUB.';

    it('Tier 1: should send successfully via Evolution API (port 8080) on first attempt', async () => {
      (global.fetch as any).mockImplementation(async (url: string) => {
        if (url.includes(':8080/chat/findChats')) {
          return { ok: false };
        }
        if (url.includes(':8080/message/sendText/GSA_WhatsApp')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({ key: { id: 'evo-msg-001' }, status: 'PENDING' }),
          };
        }
        return { ok: false };
      });

      const sent = await whatsappNotificationService.enviarWhatsAppDireto(testPhone, testMessage, {
        skipPresence: true,
      });
      expect(sent).toBe(true);

      // Verify Tier 1 call parameters
      expect(global.fetch).toHaveBeenCalledWith(
        'http://147.15.43.141:8080/message/sendText/GSA_WhatsApp',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            apikey: 'gsa_hub_evolution_token_2026',
            'Content-Type': 'application/json; charset=utf-8',
          }),
          body: JSON.stringify({
            number: '5511999991111',
            text: testMessage,
            delay: 500,
            linkPreview: true,
          }),
        })
      );

      // Tier 2 and Tier 3 should NOT be triggered
      expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    });

    it('Tier 2: should fallback to Edge Function (vps-api) when Evolution API is unavailable', async () => {
      (global.fetch as any).mockImplementation(async (url: string) => {
        if (url.includes(':8080/')) {
          throw new Error('Evolution API 502 Bad Gateway');
        }
        return { ok: false };
      });

      mockFunctionsInvoke.mockResolvedValueOnce({
        data: { success: true, messageId: 'vps-edge-002' },
        error: null,
      });

      const sent = await whatsappNotificationService.enviarWhatsAppDireto(testPhone, testMessage, {
        skipPresence: true,
      });
      expect(sent).toBe(true);

      // Verify Tier 2 call parameters
      expect(mockFunctionsInvoke).toHaveBeenCalledWith('vps-api', {
        body: {
          action: 'send-whatsapp',
          phone: '5511999991111',
          message: testMessage,
          title: 'Notificação GSA HUB',
          category: 'CLIENTE',
          targetIp: '147.15.43.141',
        },
      });
    });

    it('Tier 3: should fallback to n8n webhook (port 5678) when Evolution API and Edge Function fail', async () => {
      (global.fetch as any).mockImplementation(async (url: string) => {
        if (url.includes(':8080/')) {
          throw new Error('Evolution API Connection Refused');
        }
        if (url.includes(':5678/webhook/send-whatsapp')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ message: 'Workflow started' }),
          };
        }
        return { ok: false };
      });

      // Tier 2 fails
      mockFunctionsInvoke.mockRejectedValueOnce(new Error('Edge function error'));

      const sent = await whatsappNotificationService.enviarWhatsAppDireto(testPhone, testMessage, {
        skipPresence: true,
      });
      expect(sent).toBe(true);

      // Verify Tier 3 call
      expect(global.fetch).toHaveBeenCalledWith(
        'http://147.15.43.141:5678/webhook/send-whatsapp',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({
            phone: '5511999991111',
            message: testMessage,
            title: 'Notificação GSA HUB',
            category: 'CLIENTE',
          }),
        })
      );
    });

    it('should handle sendAdminWhatsAppNotification through the same 3-tier cascade', async () => {
      mockFunctionsInvoke.mockResolvedValueOnce({
        data: { success: true },
        error: null,
      });

      const sent = await sendAdminWhatsAppNotification({
        title: 'Novo Lead Registrado',
        category: 'VENDAS',
        message: 'O cliente João solicitou um orçamento de energia solar.',
      });

      expect(sent).toBe(true);
      expect(mockFunctionsInvoke).toHaveBeenCalledWith(
        'vps-api',
        expect.objectContaining({
          body: expect.objectContaining({
            action: 'send-whatsapp',
            title: 'Novo Lead Registrado',
          }),
        })
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. R1 Presence Choreography Sequence & Read Receipts
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. R1 Presence Choreography Sequence & Read Receipts', () => {
    it('should execute full presence sequence: markAsRead -> available -> composing -> paused -> composing -> dispatch -> unavailable', async () => {
      const stepLog: string[] = [];

      (global.fetch as any).mockImplementation((url: string, opts: any) => {
        const body = opts?.body ? JSON.parse(opts.body) : {};
        if (url.includes('/chat/findChats')) {
          return Promise.resolve({ ok: false });
        }
        if (url.includes('/chat/markMessageAsRead')) {
          stepLog.push(`markRead:${body.readMessages?.[0]?.id || 'reply'}`);
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        if (url.includes('/chat/sendPresence')) {
          stepLog.push(`presence:${body.presence}`);
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        if (url.includes('/message/sendText')) {
          stepLog.push('dispatchMessage');
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'msg_choreography_001' } }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const options: SendDirectOptions = {
        isReply: true,
        quotedMessageId: 'INBOUND_MSG_77',
        timeScale: 0.001,
        customInitialDelayMs: 0,
      };

      const result = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999995555',
        'Olá! Resposta com coreografia completa de presença.',
        options
      );

      expect(result).toBe(true);
      expect(stepLog).toEqual([
        'markRead:INBOUND_MSG_77',
        'presence:available',
        'presence:composing',
        'presence:paused',
        'presence:composing',
        'dispatchMessage',
        'presence:unavailable',
      ]);
    });

    it('should bypass presence choreography when skipPresence is true', async () => {
      const presenceCalls: string[] = [];

      (global.fetch as any).mockImplementation((url: string, opts: any) => {
        const body = opts?.body ? JSON.parse(opts.body) : {};
        if (url.includes('/chat/sendPresence')) {
          presenceCalls.push(body.presence);
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        if (url.includes('/message/sendText')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'fast_dispatch' } }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const result = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999996666',
        'Mensagem direta sem presença.',
        { skipPresence: true }
      );

      expect(result).toBe(true);
      expect(presenceCalls).toHaveLength(0);
    });

    it('should continue dispatching message even if presence API calls fail', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/chat/sendPresence')) {
          return Promise.reject(new Error('Presence endpoint 503'));
        }
        if (url.includes('/message/sendText')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'resilient_msg' } }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const result = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999997777',
        'Mensagem resiliente contra falha de presença.',
        { customInitialDelayMs: 0 }
      );

      expect(result).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. R3 Concurrency Control (Micro-Jitter & Same-Number Batching)
  // ──────────────────────────────────────────────────────────────────────────
  describe('4. R3 Concurrency Control (Micro-Jitter & Same-Number Batching)', () => {
    it('should batch multiple concurrent messages to the SAME number into a single composite message with dividers', async () => {
      let sentText = '';
      let sendCount = 0;

      (global.fetch as any).mockImplementation((url: string, opts: any) => {
        if (url.includes('/message/sendText')) {
          sendCount++;
          const body = JSON.parse(opts.body);
          sentText = body.text;
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'batched_msg_101' } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const phone = '5511988880000';

      // Send 3 notifications concurrently to the same recipient with an initial delay window
      const [res1, res2, res3] = await Promise.all([
        whatsappNotificationService.enviarWhatsAppDireto(
          phone,
          'Fatura #101 gerada no valor de R$ 150,00.',
          { customInitialDelayMs: 25, skipPresence: true }
        ),
        whatsappNotificationService.enviarWhatsAppDireto(
          phone,
          'Recibo #101 emitido com sucesso.',
          { customInitialDelayMs: 25, skipPresence: true }
        ),
        whatsappNotificationService.enviarWhatsAppDireto(
          phone,
          'Seus pontos foram creditados no programa.',
          { customInitialDelayMs: 25, skipPresence: true }
        ),
      ]);

      expect(res1).toBe(true);
      expect(res2).toBe(true);
      expect(res3).toBe(true);

      // Only ONE HTTP sendText request was made
      expect(sendCount).toBe(1);

      // Composite text contains all 3 messages separated by clean dividers
      expect(sentText).toContain('Fatura #101 gerada no valor de R$ 150,00.');
      expect(sentText).toContain('──────────────────────────────');
      expect(sentText).toContain('Recibo #101 emitido com sucesso.');
      expect(sentText).toContain('Seus pontos foram creditados no programa.');
    });

    it('should handle concurrent dispatches to DIFFERENT numbers with micro-jitter isolation', async () => {
      const recordedTimes: number[] = [];

      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/message/sendText')) {
          recordedTimes.push(Date.now());
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: `msg_jitter_${recordedTimes.length}` } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const phones = ['5511911110001', '5511911110002', '5511911110003'];
      const results = await Promise.all(
        phones.map((phone, idx) =>
          whatsappNotificationService.enviarWhatsAppDireto(
            phone,
            `Alerta de sistema para usuário #${idx + 1}`,
            { skipPresence: true }
          )
        )
      );

      expect(results.every((r) => r === true)).toBe(true);
      expect(recordedTimes).toHaveLength(3);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. R2 Dynamic Content & PDF Variations Integration
  // ──────────────────────────────────────────────────────────────────────────
  describe('5. R2 Dynamic Content & PDF Variations Integration', () => {
    it('should apply dynamic greetings, footers, URL tracking params, and zero-width entropy', async () => {
      let dispatchedPayloadText = '';

      (global.fetch as any).mockImplementation((url: string, opts: any) => {
        if (url.includes('/message/sendText')) {
          const body = JSON.parse(opts.body);
          dispatchedPayloadText = body.text;
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'variation_msg_01' } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const rawMessage =
        '🏢 *GSA — Gestão de Serviços*\n\n' +
        'Olá, *Adriano Farias*! 👋\n\n' +
        'Acesse seu portal em https://grupogsa.com.br/portal para mais detalhes.\n\n' +
        '_Mensagem enviada via GSA HUB._';

      const sent = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999991111',
        rawMessage,
        {
          clienteNome: 'Adriano Farias',
          enableVariation: true,
          enableZeroWidth: true,
          enableUrlRandomizer: true,
          skipPresence: true,
        }
      );

      expect(sent).toBe(true);
      expect(dispatchedPayloadText).toContain('Adriano Farias');
      expect(dispatchedPayloadText).toContain('t=');
      expect(dispatchedPayloadText).toContain('ref=');
      expect(/[\u200B\u200C\u200D]/.test(dispatchedPayloadText)).toBe(true);
    });

    it('should apply PDF byte variation to mediaBase64 before dispatching', async () => {
      let dispatchedMediaBase64 = '';

      (global.fetch as any).mockImplementation((url: string, opts: any) => {
        if (url.includes('/message/sendMedia')) {
          const body = JSON.parse(opts.body);
          dispatchedMediaBase64 = body.media;
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'pdf_msg_01' } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const initialBase64Pdf = 'JVBERi0xLjQKJcTl8uXrCg=='; // Sample PDF prefix

      const sent = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999992222',
        'Seu extrato em PDF em anexo.',
        {
          mediaBase64: initialBase64Pdf,
          fileName: 'extrato_mensal.pdf',
          skipPresence: true,
        }
      );

      expect(sent).toBe(true);
      expect(dispatchedMediaBase64).not.toBe(initialBase64Pdf);
      expect(dispatchedMediaBase64.length).toBeGreaterThan(initialBase64Pdf.length);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. R5 Health & Pause Dispatch Integration
  // ──────────────────────────────────────────────────────────────────────────
  describe('6. R5 Health & Pause Dispatch Integration', () => {
    it('should retain messages in local queue when dispatch is paused without calling Evolution API', async () => {
      let fetchCalled = false;

      (global.fetch as any).mockImplementation(() => {
        fetchCalled = true;
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      // 1. Set paused
      whatsappNotificationService.setPaused(true);
      expect(whatsappNotificationService.isPaused()).toBe(true);

      // 2. Dispatch while paused
      const res = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999998888',
        'Mensagem enquanto o envio está pausado.'
      );

      expect(res).toBe(true);
      expect(whatsappNotificationService.getQueueLength()).toBe(1);
      expect(fetchCalled).toBe(false);

      // 3. Unpause
      whatsappNotificationService.setPaused(false);
      expect(whatsappNotificationService.isPaused()).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Error Handling & Unreachable Endpoints
  // ──────────────────────────────────────────────────────────────────────────
  describe('7. Error Handling & Unreachable Endpoints', () => {
    it('should return false and show toast error when all 3 tiers fail', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network down'));
      mockFunctionsInvoke.mockRejectedValue(new Error('Edge function down'));

      const sent = await whatsappNotificationService.enviarWhatsAppDireto(
        '11999990000',
        'Mensagem teste',
        { skipPresence: true }
      );
      expect(sent).toBe(false);
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringContaining('Ocorreu um erro no servidor de WhatsApp')
      );
    });

    it('should return false if phone number cannot be found or resolved', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
          ilike: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [] }),
            }),
          }),
        }),
      });

      const sent = await whatsappNotificationService.enviarWhatsAppDireto(null, 'Texto sem telefone');
      expect(sent).toBe(false);
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringContaining('telefone do cliente não foi localizado')
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Automatic Phone Resolution from Context
  // ──────────────────────────────────────────────────────────────────────────
  describe('8. Automatic Phone Resolution from Context', () => {
    it('should resolve customer phone from OS code in message content', async () => {
      (global.fetch as any).mockImplementation(async (url: string) => {
        if (url.includes(':8080/message/sendText')) {
          return { ok: true, status: 200, json: async () => ({ key: { id: '123' } }) };
        }
        return { ok: false };
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'ordens_servico') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    clientes: { telefone: '11988884444' },
                  },
                }),
              }),
            }),
          };
        }
        return {};
      });

      const sent = await whatsappNotificationService.enviarWhatsAppDireto(
        null,
        'Olá! Sua Ordem de Serviço Código: *OS102* foi aprovada com sucesso.',
        { skipPresence: true }
      );

      expect(sent).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://147.15.43.141:8080/message/sendText/GSA_WhatsApp',
        expect.objectContaining({
          body: expect.stringContaining('"number":"5511988884444"'),
        })
      );
    });

    it('should resolve customer phone from customer name in greeting when OS is not present', async () => {
      (global.fetch as any).mockImplementation(async (url: string) => {
        if (url.includes(':8080/message/sendText')) {
          return { ok: true, status: 200, json: async () => ({ key: { id: '456' } }) };
        }
        return { ok: false };
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'clientes') {
          return {
            select: vi.fn().mockReturnValue({
              ilike: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [{ telefone: '11977773333' }],
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const sent = await whatsappNotificationService.enviarWhatsAppDireto(
        null,
        'Olá, *Adriano Farias*! Sua fatura está disponível para pagamento.',
        { skipPresence: true }
      );

      expect(sent).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://147.15.43.141:8080/message/sendText/GSA_WhatsApp',
        expect.objectContaining({
          body: expect.stringContaining('"number":"5511977773333"'),
        })
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 9. Message Formatting Template Engine (gerarMensagemWhatsApp)
  // ──────────────────────────────────────────────────────────────────────────
  describe('9. Message Formatting Template Engine (gerarMensagemWhatsApp)', () => {
    it('should format orcamento notification with emojis, financial data, and next steps', () => {
      const msg = whatsappNotificationService.gerarMensagemWhatsApp({
        tipo: 'orcamento',
        clienteNome: 'Mariana Silva',
        codigo: 'ORC-2026-001',
        status: 'aprovado',
        valorTotal: 1500,
        detalhesExtras: 'Instalação de câmeras de segurança',
      });

      expect(msg).toContain('Olá, *Mariana Silva*!');
      expect(msg).toContain('📋 *DETALHES DO ORÇAMENTO*');
      expect(msg).toContain('ORC-2026-001');
      expect(msg).toContain('Instalação de câmeras de segurança');
      expect(msg).toContain('_Mensagem enviada via GSA HUB._');
    });

    it('should format fatura notification with payment methods and due date', () => {
      const msg = whatsappNotificationService.gerarMensagemWhatsApp({
        tipo: 'fatura',
        clienteNome: 'Empresa ABC',
        codigo: 'FAT-2026-99',
        status: 'pendente',
        valorTotal: '450.00',
        dataVencimento: '30/08/2026',
      });

      expect(msg).toContain('💳 *DETALHES DA FATURA*');
      expect(msg).toContain('FAT-2026-99');
      expect(msg).toContain('30/08/2026');
      expect(msg).toContain('450.00');
    });

    it('should format voucher / benefit redemption message', () => {
      const msg = whatsappNotificationService.gerarMensagemWhatsApp({
        tipo: 'voucher',
        clienteNome: 'Lucas Santos',
        codigo: 'VOUCHER-GSA-50',
        status: 'ativo',
        detalhesExtras: '50% de desconto na primeira consulta',
      });

      expect(msg).toContain('🎟️ *DADOS DO VOUCHER*');
      expect(msg).toContain('VOUCHER-GSA-50');
      expect(msg).toContain('50% de desconto na primeira consulta');
    });

    it('should format marketplace compra notification with order summary and status', () => {
      const msg = whatsappNotificationService.gerarMensagemWhatsApp({
        tipo: 'compra',
        clienteNome: 'Roberto Dias',
        codigo: 'PED-LOJA-88',
        status: 'pago',
        valorTotal: 300,
      });

      expect(msg).toContain('*RESUMO DO PEDIDO*');
      expect(msg).toContain('PED-LOJA-88');
      expect(msg).toContain('✅');
      expect(msg).toContain('pago');
    });
  });
});

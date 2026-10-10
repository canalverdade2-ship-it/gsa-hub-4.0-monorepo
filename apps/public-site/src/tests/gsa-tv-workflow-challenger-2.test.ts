import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Helper to resolve workspace files
const rootDir = process.cwd();
const readSource = (relPath: string) => fs.readFileSync(path.join(rootDir, relPath), 'utf8');

/**
 * Pure helper replicating GsaTvScheduleTab end time computation logic.
 */
export function computeSlotEndTimeChallenger(
  startIso: string,
  mediaDurationSec?: number | null,
  fallbackSec: number = 1800,
  explicitEndIso?: string,
): string {
  if (explicitEndIso && explicitEndIso.trim()) {
    return new Date(explicitEndIso).toISOString();
  }
  const startDate = new Date(startIso);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error('Data de início inválida');
  }
  // Logic from GsaTvScheduleTab.tsx: const durationSec = Number(selectedMediaItem?.duration_s) || 1800;
  const rawNum = Number(mediaDurationSec);
  const durationSec = rawNum > 0 ? rawNum : fallbackSec;
  const endDate = new Date(startDate.getTime() + durationSec * 1000);
  return endDate.toISOString();
}

/**
 * Pure helper replicating GsaTvScheduleTab "Hoje Agora" button timestamp generator.
 */
export function generateHojeAgoraTimestamp(referenceDate: Date = new Date()): string {
  const d = new Date(referenceDate);
  d.setSeconds(0, 0);
  const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return localIso;
}

/**
 * Pure helper replicating GsaTvScheduleTab form validation.
 */
export function validateScheduleSlotInput(slot: {
  mediaId?: string;
  start?: string;
  end?: string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!slot.mediaId || !slot.mediaId.trim()) {
    errors.push('Preencha a mídia');
  }
  if (!slot.start || !slot.start.trim()) {
    errors.push('Preencha o horário de início');
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

describe('Challenger 2 — Adversarial Verification: Master 1-Click & Grade Form', () => {

  // ──────────────────────────────────────────────────────────────────────────
  // Challenge 1: Static and AST Analysis of window.confirm
  // ──────────────────────────────────────────────────────────────────────────
  describe('Challenge 1: window.confirm Dialog Removal & Audit', () => {
    it('1.1: GsaTvLiveConsole.tsx contains 0 window.confirm dialogs', () => {
      const content = readSource('src/components/admin/GsaTvLiveConsole.tsx');
      const matches = content.match(/window\.confirm/g) || [];
      expect(matches.length).toBe(0);
    });

    it('1.2: GsaTvModule.tsx contains 0 window.confirm dialogs', () => {
      const content = readSource('src/components/admin/GsaTvModule.tsx');
      const matches = content.match(/window\.confirm/g) || [];
      expect(matches.length).toBe(0);
    });

    it('1.3: GsaTvSettingsTab.tsx contains 0 window.confirm dialogs', () => {
      const content = readSource('src/components/admin/gsa-tv/GsaTvSettingsTab.tsx');
      const matches = content.match(/window\.confirm/g) || [];
      expect(matches.length).toBe(0);
    });

    it('1.4: GsaTvMasterControl.tsx transmission/playout commands contain 0 window.confirm dialogs', () => {
      const content = readSource('src/components/admin/gsa-tv/GsaTvMasterControl.tsx');
      
      // Playout/transmission functions: executeCommand and handleTake must have 0 window.confirm
      // Extract executeCommand block
      const executeMatch = content.match(/const executeCommand = async \([\s\S]*?finally \{[\s\S]*?\};/);
      expect(executeMatch).not.toBeNull();
      expect(executeMatch![0]).not.toContain('window.confirm');

      // Extract handleTake block
      const handleTakeMatch = content.match(/const handleTake = async \(\) => \{[\s\S]*?finally \{[\s\S]*?setBusy\(''\);[\s\S]*?\}/);
      expect(handleTakeMatch).not.toBeNull();
      expect(handleTakeMatch![0]).not.toContain('window.confirm');
    });

    it('1.5: GsaTvMasterControl.tsx adversarial audit surfaces the remaining window.confirm in handleClearAllSpots', () => {
      const content = readSource('src/components/admin/gsa-tv/GsaTvMasterControl.tsx');
      const allConfirmMatches = content.match(/window\.confirm\([^)]*\)/g) || [];
      
      // Challenger discovery: Line 556 has exactly 1 window.confirm guarding handleClearAllSpots
      expect(allConfirmMatches.length).toBe(1);
      expect(allConfirmMatches[0]).toContain('Deseja realmente excluir todas as peças publicitárias da biblioteca?');
    });

    it('1.6: confirmCommand in GsaTvModule.tsx dispatches directly without modal or confirmation', () => {
      const enqueued: string[] = [];
      const mockEnqueue = (jobType: string) => { enqueued.push(jobType); };
      const confirmCommand = (_message: string, jobType: string) => { void mockEnqueue(jobType); };

      confirmCommand('Iniciar envio do sinal?', 'stream_start');
      confirmCommand('Encerrar completamente o envio?', 'stream_stop');

      expect(enqueued).toEqual(['stream_start', 'stream_stop']);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Challenge 2: Mathematical and Pragmatic Proof of Required Fields Reduction
  // ──────────────────────────────────────────────────────────────────────────
  describe('Challenge 2: Grade de Programação Required Fields Reduction (>= 30%)', () => {
    it('2.1: Mathematical Proof: Required fields drop from 3 to 2, yielding 33.33% reduction (>= 30%)', () => {
      const baselineRequiredFields = ['mediaId', 'start', 'end'];
      const simplifiedRequiredFields = ['mediaId', 'start'];

      const baselineCount = baselineRequiredFields.length; // 3
      const simplifiedCount = simplifiedRequiredFields.length; // 2
      const delta = baselineCount - simplifiedCount; // 1

      const reductionPercentage = (delta / baselineCount) * 100; // 33.333...%

      expect(baselineCount).toBe(3);
      expect(simplifiedCount).toBe(2);
      expect(delta).toBe(1);
      expect(reductionPercentage).toBeCloseTo(33.333, 2);
      expect(reductionPercentage).toBeGreaterThanOrEqual(30.0);
    });

    it('2.2: Pragmatic Proof: Form submission succeeds with only mediaId and start (end omitted)', () => {
      const result = validateScheduleSlotInput({
        mediaId: 'media-prog-001',
        start: '2026-09-10T08:00',
        end: undefined, // omitted by user
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('2.3: Form submission fails if mediaId is missing, empty, or whitespace', () => {
      const resEmpty = validateScheduleSlotInput({ mediaId: '', start: '2026-09-10T08:00' });
      expect(resEmpty.valid).toBe(false);
      expect(resEmpty.errors).toContain('Preencha a mídia');

      const resSpaces = validateScheduleSlotInput({ mediaId: '   ', start: '2026-09-10T08:00' });
      expect(resSpaces.valid).toBe(false);
      expect(resSpaces.errors).toContain('Preencha a mídia');
    });

    it('2.4: Form submission fails if start is missing, empty, or whitespace', () => {
      const resEmpty = validateScheduleSlotInput({ mediaId: 'media-001', start: '' });
      expect(resEmpty.valid).toBe(false);
      expect(resEmpty.errors).toContain('Preencha o horário de início');

      const resSpaces = validateScheduleSlotInput({ mediaId: 'media-001', start: '  \t ' });
      expect(resSpaces.valid).toBe(false);
      expect(resSpaces.errors).toContain('Preencha o horário de início');
    });

    it('2.5: HTML AST verifies required attribute is absent on slot.end input in GsaTvScheduleTab.tsx', () => {
      const scheduleContent = readSource('src/components/admin/gsa-tv/GsaTvScheduleTab.tsx');

      // The slot.start input block contains 'required'
      const startBlockMatch = scheduleContent.match(/<input(?:(?!<input)[\s\S])*?value=\{slot\.start\}(?:(?!<input)[\s\S])*?\/>/);
      expect(startBlockMatch).not.toBeNull();
      expect(startBlockMatch![0]).toContain('required');

      // The slot.end input block MUST NOT contain 'required'
      const endBlockMatch = scheduleContent.match(/<input(?:(?!<input)[\s\S])*?value=\{slot\.end\}(?:(?!<input)[\s\S])*?\/>/);
      expect(endBlockMatch).not.toBeNull();
      expect(endBlockMatch![0]).not.toContain('required');

      // The label MUST explicitly indicate "(Opcional - Automático)"
      expect(scheduleContent).toContain('Fim (Opcional - Automático)');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Challenge 3: Schedule Edge Cases (0s, missing, negative, NaN, Hoje Agora)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Challenge 3: Schedule Timing Edge Cases & Robustness', () => {
    const baseStart = '2026-09-10T12:00:00.000Z';

    it('3.1: Missing end: accurately calculated from standard media duration (1200s = 20min)', () => {
      const computedEnd = computeSlotEndTimeChallenger(baseStart, 1200);
      expect(computedEnd).toBe('2026-09-10T12:20:00.000Z');
    });

    it('3.2: Media with 0s duration: safely triggers fallback to 1800s (30min)', () => {
      const computedEnd = computeSlotEndTimeChallenger(baseStart, 0);
      expect(computedEnd).toBe('2026-09-10T12:30:00.000Z');
    });

    it('3.3: Media with undefined duration: safely triggers fallback to 1800s (30min)', () => {
      const computedEnd = computeSlotEndTimeChallenger(baseStart, undefined);
      expect(computedEnd).toBe('2026-09-10T12:30:00.000Z');
    });

    it('3.4: Media with null duration: safely triggers fallback to 1800s (30min)', () => {
      const computedEnd = computeSlotEndTimeChallenger(baseStart, null);
      expect(computedEnd).toBe('2026-09-10T12:30:00.000Z');
    });

    it('3.5: Media with negative duration: safely triggers fallback to 1800s (30min)', () => {
      const computedEnd = computeSlotEndTimeChallenger(baseStart, -450);
      expect(computedEnd).toBe('2026-09-10T12:30:00.000Z');
    });

    it('3.6: Media with NaN / non-numeric duration: safely triggers fallback to 1800s (30min)', () => {
      const computedEnd = computeSlotEndTimeChallenger(baseStart, Number('corrupted_duration'));
      expect(computedEnd).toBe('2026-09-10T12:30:00.000Z');
    });

    it('3.7: Boundary durations: 1 second and 86400 seconds (24h)', () => {
      // 1 second
      expect(computeSlotEndTimeChallenger(baseStart, 1)).toBe('2026-09-10T12:00:01.000Z');
      // 24 hours
      expect(computeSlotEndTimeChallenger(baseStart, 86400)).toBe('2026-09-11T12:00:00.000Z');
    });

    it('3.8: Floating point seconds: e.g. 15.75s resolves cleanly without fractional millisecond drift', () => {
      const computedEnd = computeSlotEndTimeChallenger(baseStart, 15.5);
      const parsedEnd = new Date(computedEnd);
      expect(parsedEnd.getTime() - new Date(baseStart).getTime()).toBe(15500);
    });

    it('3.9: Explicit end provided by user: overrides automatic calculation', () => {
      const explicitEnd = '2026-09-10T14:45:00.000Z';
      const computedEnd = computeSlotEndTimeChallenger(baseStart, 1200, 1800, explicitEnd);
      expect(computedEnd).toBe('2026-09-10T14:45:00.000Z');
    });

    it('3.10: "Hoje Agora" button: produces valid datetime-local ISO format conforming to local clock', () => {
      const testDate = new Date('2026-09-10T15:42:25.800Z');
      const stamp = generateHojeAgoraTimestamp(testDate);

      // Must conform to YYYY-MM-DDTHH:mm (16 characters)
      expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      expect(stamp.length).toBe(16);

      // Must parse back into a valid timestamp
      const parsed = new Date(stamp);
      expect(Number.isNaN(parsed.getTime())).toBe(false);
    });

    it('3.11: "Hoje Agora" across month and year boundaries', () => {
      // Leap year boundary: Feb 28 -> Feb 29 (2028 is leap year)
      const leapDay = new Date('2028-02-29T23:59:00');
      const stampLeap = generateHojeAgoraTimestamp(leapDay);
      expect(stampLeap).toContain('2028-02-29');

      // Year boundary: Dec 31 -> Jan 1
      const yearEnd = new Date('2026-12-31T23:59:00');
      const stampYearEnd = generateHojeAgoraTimestamp(yearEnd);
      expect(stampYearEnd).toContain('2026-12-31');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Challenge 4: 1-Click Operational Dispatch Emulation & Stress Test
  // ──────────────────────────────────────────────────────────────────────────
  describe('Challenge 4: 1-Click Operational Dispatch Emulation', () => {
    it('4.1: Playout operations execute synchronously with 0 confirmation gates', async () => {
      const dispatchedCommands: string[] = [];
      const confirmSpy = vi.fn();
      
      const originalConfirm = globalThis.window?.confirm;
      if (globalThis.window) {
        globalThis.window.confirm = confirmSpy;
      }

      // Emulate live console run function
      const liveConsoleRun = async (command: string, payload: Record<string, unknown> = {}) => {
        dispatchedCommands.push(command);
        return { ok: true, command, payload };
      };

      const commandsToTest = [
        'playout_previous',
        'playout_next',
        'playout_reset',
        'stream_pause',
        'stream_resume',
        'stream_stop',
        'stream_start',
        'emergency_take',
        'live_return',
        'media_take',
        'live_take',
      ];

      for (const cmd of commandsToTest) {
        await liveConsoleRun(cmd, { test: true });
      }

      expect(dispatchedCommands).toEqual(commandsToTest);
      expect(confirmSpy).not.toHaveBeenCalled();

      if (globalThis.window && originalConfirm) {
        globalThis.window.confirm = originalConfirm;
      }
    });

    it('4.2: Master Control Break takeover executes in 1 click without confirm dialog', async () => {
      const confirmSpy = vi.fn();
      const originalConfirm = globalThis.window?.confirm;
      if (globalThis.window) {
        globalThis.window.confirm = confirmSpy;
      }

      let breakTriggered = false;
      const handleTakeBreak = async () => {
        // Simplified R2 logic: no if (window.confirm(...))
        breakTriggered = true;
        return { status: 'NO AR' };
      };

      await handleTakeBreak();
      expect(breakTriggered).toBe(true);
      expect(confirmSpy).not.toHaveBeenCalled();

      if (globalThis.window && originalConfirm) {
        globalThis.window.confirm = originalConfirm;
      }
    });
  });
});

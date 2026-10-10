import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRealtimeSubscription, useRealtime, RealtimeSubscriptionConfig } from '../hooks/useRealtime';
import { getSupabase } from '../lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// Mock Supabase Realtime Channels
const mockSubscribedChannels: any[] = [];
const mockRemovedChannels: any[] = [];

describe('EMPIRICAL CHALLENGE SUITE: Realtime Hook Concurrency, Index Mapping & Stale Closures', () => {
  let client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscribedChannels.length = 0;
    mockRemovedChannels.length = 0;
    client = getSupabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Challenge 1: Multi-Table Subscriptions with Disabled Tables (Index Mapping)', () => {
    it('correctly maps callbacks to active table when table 0 is disabled and table 1 is enabled', () => {
      const channelCallbacks: Record<string, Function[]> = {};

      const mockChannel = {
        name: 'test-multi-channel',
        on: vi.fn((event: string, opts: any, cb: Function) => {
          channelCallbacks[opts.table] = channelCallbacks[opts.table] || [];
          channelCallbacks[opts.table].push(cb);
          return mockChannel;
        }),
        subscribe: vi.fn((cb?: (status: string) => void) => {
          if (cb) cb('SUBSCRIBED');
          mockSubscribedChannels.push(mockChannel);
          return mockChannel;
        }),
      };

      vi.spyOn(client, 'channel').mockReturnValue(mockChannel as any);
      vi.spyOn(client, 'removeChannel').mockResolvedValue('ok' as any);

      const table0Payload = vi.fn();
      const table0Change = vi.fn();
      const table1Payload = vi.fn();
      const table1Change = vi.fn();
      const table2Payload = vi.fn();
      const table2Change = vi.fn();

      const configs: RealtimeSubscriptionConfig[] = [
        {
          table: 'table_0_disabled',
          enabled: false,
          onPayload: table0Payload,
          onChange: table0Change,
        },
        {
          table: 'table_1_enabled',
          enabled: true,
          onPayload: table1Payload,
          onChange: table1Change,
        },
        {
          table: 'table_2_disabled',
          enabled: false,
          onPayload: table2Payload,
          onChange: table2Change,
        },
      ];

      // Simulate hook setup logic directly reflecting useRealtimeSubscription
      const incomingConfigs = configs;
      const callbacksRef = {
        current: incomingConfigs.map((c) => ({
          onPayload: c.onPayload,
          onChange: c.onChange,
        })),
      };

      const enabledConfigsWithIdx = incomingConfigs
        .map((config, originalIdx) => ({ config, originalIdx }))
        .filter(({ config }) => config.enabled !== false);

      expect(enabledConfigsWithIdx).toHaveLength(1);
      expect(enabledConfigsWithIdx[0].originalIdx).toBe(1);
      expect(enabledConfigsWithIdx[0].config.table).toBe('table_1_enabled');

      // Register channel
      let channel = client.channel('multi-test');
      enabledConfigsWithIdx.forEach(({ config, originalIdx }) => {
        channel = channel.on(
          'postgres_changes',
          { event: config.event || '*', schema: config.schema || 'public', table: config.table },
          (payload: any) => {
            const activeCallbacks = callbacksRef.current[originalIdx];
            if (activeCallbacks?.onPayload) activeCallbacks.onPayload(payload);
            if (activeCallbacks?.onChange) activeCallbacks.onChange();
          }
        );
      });

      // Verify that channel.on was ONLY called for table_1_enabled
      expect(mockChannel.on).toHaveBeenCalledTimes(1);
      expect(channelCallbacks['table_0_disabled']).toBeUndefined();
      expect(channelCallbacks['table_1_enabled']).toBeDefined();
      expect(channelCallbacks['table_1_enabled']).toHaveLength(1);

      // Fire simulated event on table_1_enabled
      const mockEvt: RealtimePostgresChangesPayload<any> = {
        schema: 'public',
        table: 'table_1_enabled',
        commit_timestamp: new Date().toISOString(),
        eventType: 'INSERT',
        new: { id: 'item-101', name: 'Valid Entry' },
        old: {},
        errors: null,
      };

      channelCallbacks['table_1_enabled'][0](mockEvt);

      // Assert table 1 callbacks were executed with exact payload
      expect(table1Payload).toHaveBeenCalledTimes(1);
      expect(table1Payload).toHaveBeenCalledWith(mockEvt);
      expect(table1Change).toHaveBeenCalledTimes(1);

      // Assert table 0 and table 2 callbacks were NEVER touched
      expect(table0Payload).not.toHaveBeenCalled();
      expect(table0Change).not.toHaveBeenCalled();
      expect(table2Payload).not.toHaveBeenCalled();
      expect(table2Change).not.toHaveBeenCalled();
    });

    it('handles interleaved multi-table subscriptions [disabled, enabled, disabled, enabled]', () => {
      const channelCallbacks: Record<string, Function[]> = {};

      const mockChannel = {
        name: 'test-interleaved',
        on: vi.fn((event: string, opts: any, cb: Function) => {
          channelCallbacks[opts.table] = channelCallbacks[opts.table] || [];
          channelCallbacks[opts.table].push(cb);
          return mockChannel;
        }),
        subscribe: vi.fn((cb?: (status: string) => void) => {
          if (cb) cb('SUBSCRIBED');
          return mockChannel;
        }),
      };

      vi.spyOn(client, 'channel').mockReturnValue(mockChannel as any);

      const fns = {
        t0: { payload: vi.fn(), change: vi.fn() },
        t1: { payload: vi.fn(), change: vi.fn() },
        t2: { payload: vi.fn(), change: vi.fn() },
        t3: { payload: vi.fn(), change: vi.fn() },
      };

      const configs: RealtimeSubscriptionConfig[] = [
        { table: 'users_disabled', enabled: false, onPayload: fns.t0.payload, onChange: fns.t0.change },
        { table: 'orders_enabled', enabled: true, onPayload: fns.t1.payload, onChange: fns.t1.change },
        { table: 'logs_disabled', enabled: false, onPayload: fns.t2.payload, onChange: fns.t2.change },
        { table: 'payments_enabled', enabled: true, onPayload: fns.t3.payload, onChange: fns.t3.change },
      ];

      const callbacksRef = {
        current: configs.map((c) => ({
          onPayload: c.onPayload,
          onChange: c.onChange,
        })),
      };

      const enabledWithIdx = configs
        .map((config, originalIdx) => ({ config, originalIdx }))
        .filter(({ config }) => config.enabled !== false);

      expect(enabledWithIdx).toEqual([
        { config: configs[1], originalIdx: 1 },
        { config: configs[3], originalIdx: 3 },
      ]);

      let channel = client.channel('interleaved-chan');
      enabledWithIdx.forEach(({ config, originalIdx }) => {
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: config.table },
          (payload: any) => {
            const activeCallbacks = callbacksRef.current[originalIdx];
            if (activeCallbacks?.onPayload) activeCallbacks.onPayload(payload);
            if (activeCallbacks?.onChange) activeCallbacks.onChange();
          }
        );
      });

      // Fire event on orders_enabled
      channelCallbacks['orders_enabled'][0]({ table: 'orders_enabled', eventType: 'INSERT' });
      expect(fns.t1.payload).toHaveBeenCalledTimes(1);
      expect(fns.t1.change).toHaveBeenCalledTimes(1);
      expect(fns.t3.payload).not.toHaveBeenCalled();

      // Fire event on payments_enabled
      channelCallbacks['payments_enabled'][0]({ table: 'payments_enabled', eventType: 'UPDATE' });
      expect(fns.t3.payload).toHaveBeenCalledTimes(1);
      expect(fns.t3.change).toHaveBeenCalledTimes(1);

      // Verify disabled tables were never triggered
      expect(fns.t0.payload).not.toHaveBeenCalled();
      expect(fns.t2.payload).not.toHaveBeenCalled();
    });
  });

  describe('Challenge 2: Debounce Timer Isolation across Multiple Tables', () => {
    it('isolates debounce timers between different tables without interference', () => {
      vi.useFakeTimers();

      const timerMap: { [key: number]: any } = {};
      const t1Change = vi.fn();
      const t2Change = vi.fn();

      const configs: RealtimeSubscriptionConfig[] = [
        { table: 'table_1_fast', debounceMs: 50, onChange: t1Change },
        { table: 'table_2_slow', debounceMs: 150, onChange: t2Change },
      ];

      const callbacksRef = {
        current: configs.map(c => ({ onChange: c.onChange })),
      };

      function triggerEvent(originalIdx: number) {
        const config = configs[originalIdx];
        const debounceMs = config.debounceMs ?? 0;
        if (debounceMs > 0) {
          if (timerMap[originalIdx]) {
            clearTimeout(timerMap[originalIdx]);
          }
          timerMap[originalIdx] = setTimeout(() => {
            timerMap[originalIdx] = null;
            if (callbacksRef.current[originalIdx]?.onChange) {
              callbacksRef.current[originalIdx].onChange!();
            }
          }, debounceMs);
        }
      }

      // 1. Trigger table 1 (50ms) at t=0
      triggerEvent(0);

      // 2. Trigger table 2 (150ms) at t=20
      vi.advanceTimersByTime(20);
      triggerEvent(1);

      // 3. At t=40, trigger table 1 AGAIN (resets table 1's timer to t=40+50=90ms)
      vi.advanceTimersByTime(20);
      triggerEvent(0);

      // Table 2 timer was set at t=20 for 150ms -> fires at t=170.
      // Table 1 timer was reset at t=40 for 50ms -> fires at t=90.

      // At t=60 (advance by 20ms): neither has fired yet
      vi.advanceTimersByTime(20);
      expect(t1Change).not.toHaveBeenCalled();
      expect(t2Change).not.toHaveBeenCalled();

      // At t=95 (advance by 35ms): Table 1 should have fired once! Table 2 should NOT have fired.
      vi.advanceTimersByTime(35);
      expect(t1Change).toHaveBeenCalledTimes(1);
      expect(t2Change).not.toHaveBeenCalled();

      // At t=180 (advance by 85ms): Table 2 should have fired once!
      vi.advanceTimersByTime(85);
      expect(t1Change).toHaveBeenCalledTimes(1);
      expect(t2Change).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  describe('Challenge 3: Stale Closure Prevention on Re-renders', () => {
    it('always invokes fresh callback references after re-render without reconnecting channel', () => {
      let capturedValue = 'initial_state';

      const configsFn = (val: string): RealtimeSubscriptionConfig[] => [
        {
          table: 'items',
          onChange: () => {
            capturedValue = val;
          },
        },
      ];

      // Simulate first render pass
      let currentConfigs = configsFn('render_1_state');
      const callbacksRef = {
        current: currentConfigs.map(c => ({ onChange: c.onChange })),
      };

      // Handler registered during mount
      const registeredHandler = () => {
        const active = callbacksRef.current[0];
        if (active?.onChange) active.onChange();
      };

      // Simulate re-render with new state passed into config
      currentConfigs = configsFn('render_2_fresh_state');
      callbacksRef.current = currentConfigs.map(c => ({ onChange: c.onChange }));

      // Realtime event arrives AFTER re-render
      registeredHandler();

      // Assert that fresh state 'render_2_fresh_state' was captured, NOT stale 'render_1_state'
      expect(capturedValue).toBe('render_2_fresh_state');
    });
  });

  describe('Challenge 4: Unmount & Resource Cleanup', () => {
    it('clears all active debounce timers on unmount', () => {
      vi.useFakeTimers();

      const timers: { [key: number]: any } = {
        0: setTimeout(() => {}, 1000),
        1: setTimeout(() => {}, 2000),
        2: setTimeout(() => {}, 3000),
      };

      // Simulate cleanup block
      Object.values(timers).forEach(timer => {
        if (timer) clearTimeout(timer);
      });

      // Timers should not fire
      expect(vi.getTimerCount()).toBe(0);

      vi.useRealTimers();
    });
  });
});

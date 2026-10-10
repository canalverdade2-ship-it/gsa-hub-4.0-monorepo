import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { DependencyList } from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type RealtimePostgresEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

export type RealtimeSubscriptionStatus =
  | 'INITIALIZING'
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR';

export interface RealtimeSubscriptionConfig<T = any> {
  table: string;
  schema?: string;
  filter?: string; // e.g. "cliente_id=eq.123" or "status=eq.ativo"
  event?: RealtimePostgresEvent;
  debounceMs?: number;
  channelName?: string;
  onPayload?: (payload: RealtimePostgresChangesPayload<T>) => void;
  onChange?: () => void | Promise<void>;
  enabled?: boolean;
}

export type RealtimeSubscriptionOptions<T = any> = RealtimeSubscriptionConfig<T>;

export interface RealtimeSubscriptionResult {
  status: RealtimeSubscriptionStatus;
  channel: RealtimeChannel | null;
  unsubscribe: () => void;
}

let channelCounter = 0;

function generateChannelName(configs: RealtimeSubscriptionConfig[]): string {
  channelCounter += 1;
  const tablePart = configs.map((c) => c.table).slice(0, 3).join('-');
  const filterPart = configs[0]?.filter ? `_${configs[0].filter.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20)}` : '';
  return `rt_${tablePart}${filterPart}_${Date.now()}_${channelCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Canonical hook for Supabase Realtime subscriptions across the GSA HUB platform.
 * Supports single or multi-table subscriptions, row-level filters, debounced callbacks,
 * status tracking, and guaranteed unmount cleanup via supabase.removeChannel.
 */
export function useRealtimeSubscription<T = any>(
  options: RealtimeSubscriptionConfig<T> | RealtimeSubscriptionConfig<T>[],
  deps?: DependencyList
): RealtimeSubscriptionResult {
  const [status, setStatus] = useState<RealtimeSubscriptionStatus>('INITIALIZING');
  const channelRef = useRef<RealtimeChannel | null>(null);
  const debounceTimersRef = useRef<{ [key: number]: ReturnType<typeof setTimeout> | null }>({});
  const isMountedRef = useRef(true);

  // 1. Direct normalization of incoming configs on every render (Fixes R1-01 Stale Closures)
  const incomingConfigs = Array.isArray(options) ? options : [options];

  const callbacksRef = useRef<Array<{
    onPayload?: (payload: RealtimePostgresChangesPayload<any>) => void;
    onChange?: () => void | Promise<void>;
  }>>([]);

  // Always sync fresh callback references on every render pass
  callbacksRef.current = incomingConfigs.map((c) => ({
    onPayload: c.onPayload,
    onChange: c.onChange,
  }));

  // 2. Structural memoization for channel topic subscription
  const rawConfigs = useMemo(() => {
    return Array.isArray(options) ? options : [options];
  }, [
    Array.isArray(options)
      ? JSON.stringify(options.map((o) => ({
          table: o.table,
          filter: o.filter,
          schema: o.schema,
          event: o.event,
          enabled: o.enabled,
          debounceMs: o.debounceMs,
          channelName: o.channelName,
        })))
      : `${options.table}_${options.filter}_${options.schema}_${options.event}_${options.enabled}_${options.debounceMs}_${options.channelName}`
  ]);

  const isEnabled = rawConfigs.length > 0 && rawConfigs.some((c) => c.enabled !== false);

  const unsubscribe = useCallback(() => {
    // Clear debounce timers
    Object.values(debounceTimersRef.current).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
    debounceTimersRef.current = {};

    if (channelRef.current) {
      const activeChannel = channelRef.current;
      channelRef.current = null;
      setStatus('CLOSED');
      supabase.removeChannel(activeChannel).catch((err) => {
        console.warn('[useRealtime] Error removing channel during manual unsubscribe:', err);
      });
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    if (!isEnabled) {
      setStatus('CLOSED');
      return () => {
        isMountedRef.current = false;
      };
    }

    // 3. Preserve original indices to prevent index desync when enabled: false is present (Fixes R1-02)
    const enabledConfigsWithIdx = rawConfigs
      .map((config, originalIdx) => ({ config, originalIdx }))
      .filter(({ config }) => config.enabled !== false);

    if (enabledConfigsWithIdx.length === 0) {
      setStatus('CLOSED');
      return () => {
        isMountedRef.current = false;
      };
    }

    setStatus('INITIALIZING');

    // Use custom channel name if provided, otherwise generate a unique deterministic channel name
    const customName = enabledConfigsWithIdx.find(({ config }) => config.channelName)?.config.channelName;
    const channelName = customName || generateChannelName(enabledConfigsWithIdx.map(({ config }) => config));

    let channel = supabase.channel(channelName);

    enabledConfigsWithIdx.forEach(({ config, originalIdx }) => {
      const eventType = config.event || '*';
      const schemaName = config.schema || 'public';
      const filterStr = config.filter;

      const changeOptions: {
        event: RealtimePostgresEvent;
        schema: string;
        table: string;
        filter?: string;
      } = {
        event: eventType,
        schema: schemaName,
        table: config.table,
      };

      if (filterStr) {
        changeOptions.filter = filterStr;
      }

      channel = channel.on(
        'postgres_changes',
        changeOptions as any,
        (payload: RealtimePostgresChangesPayload<any>) => {
          if (!isMountedRef.current) return;

          // Access callbacks via originalIdx
          const activeCallbacks = callbacksRef.current[originalIdx];

          // A. onPayload execution
          if (activeCallbacks?.onPayload) {
            try {
              activeCallbacks.onPayload(payload);
            } catch (payloadErr) {
              console.error(`[useRealtime] Error in onPayload for ${config.table}:`, payloadErr);
            }
          }

          // B. onChange execution with debouncing
          if (activeCallbacks?.onChange) {
            const debounceMs = config.debounceMs ?? 0;
            if (debounceMs > 0) {
              if (debounceTimersRef.current[originalIdx]) {
                clearTimeout(debounceTimersRef.current[originalIdx]!);
              }
              debounceTimersRef.current[originalIdx] = setTimeout(() => {
                debounceTimersRef.current[originalIdx] = null;
                if (isMountedRef.current && callbacksRef.current[originalIdx]?.onChange) {
                  try {
                    void callbacksRef.current[originalIdx]!.onChange!();
                  } catch (changeErr) {
                    console.error(`[useRealtime] Error in debounced onChange for ${config.table}:`, changeErr);
                  }
                }
              }, debounceMs);
            } else {
              try {
                void activeCallbacks.onChange();
              } catch (changeErr) {
                console.error(`[useRealtime] Error in onChange for ${config.table}:`, changeErr);
              }
            }
          }
        }
      );
    });

    channelRef.current = channel;

    channel.subscribe((subStatus, err) => {
      // Guard against superseded channels during fast remounts (Fixes R1-03)
      if (!isMountedRef.current || channelRef.current !== channel) return;

      if (subStatus === 'SUBSCRIBED') {
        setStatus('SUBSCRIBED');
      } else if (subStatus === 'TIMED_OUT') {
        setStatus('TIMED_OUT');
        console.warn(`[useRealtime] Channel subscription timed out: ${channelName}`);
      } else if (subStatus === 'CLOSED') {
        setStatus('CLOSED');
      } else if (subStatus === 'CHANNEL_ERROR') {
        setStatus('CHANNEL_ERROR');
        console.warn(`[useRealtime] Channel error on ${channelName}:`, err);
      }
    });

    return () => {
      isMountedRef.current = false;

      // Clear any pending debounce timers
      Object.values(debounceTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      debounceTimersRef.current = {};

      if (channelRef.current) {
        const chan = channelRef.current;
        channelRef.current = null;
        supabase.removeChannel(chan).catch((err) => {
          console.warn(`[useRealtime] Cleanup error removing channel ${channelName}:`, err);
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps ? deps : [isEnabled, JSON.stringify(rawConfigs.map(c => ({
    t: c.table,
    s: c.schema || 'public',
    f: c.filter,
    e: c.event || '*',
    d: c.debounceMs,
    c: c.channelName
  })))]);

  return {
    status,
    channel: channelRef.current,
    unsubscribe,
  };
}

/**
 * Overloaded helper hook supporting both shorthand syntax:
 *   useRealtime('parceiros', () => fetchPartners())
 *   useRealtime('parceiros', () => fetchPartners(), { filter: 'status=eq.ativo', debounceMs: 300 })
 *   useRealtime('parceiros', () => fetchPartners(), [deps])
 * and object/array syntax:
 *   useRealtime({ table: 'parceiros', onChange: fetchPartners }, [deps])
 *   useRealtime([{ table: 'faturas' }, { table: 'saques' }], [deps])
 */
export function useRealtime<T = any>(
  tableOrOptions: string | RealtimeSubscriptionConfig<T> | RealtimeSubscriptionConfig<T>[],
  onChangeOrDeps?: (() => void | Promise<void>) | DependencyList,
  optionsOrDeps?: Partial<RealtimeSubscriptionConfig<T>> | DependencyList
): RealtimeSubscriptionResult {
  const isString = typeof tableOrOptions === 'string';
  const onChange = typeof onChangeOrDeps === 'function' ? onChangeOrDeps : undefined;
  const isArrayDeps = Array.isArray(optionsOrDeps);
  const extraOptions =
    typeof optionsOrDeps === 'object' && !isArrayDeps && optionsOrDeps !== null
      ? (optionsOrDeps as Partial<RealtimeSubscriptionConfig<T>>)
      : {};

  const deps = isString
    ? (isArrayDeps
        ? (optionsOrDeps as DependencyList)
        : (Array.isArray(onChangeOrDeps) ? (onChangeOrDeps as DependencyList) : undefined))
    : (Array.isArray(onChangeOrDeps)
        ? (onChangeOrDeps as DependencyList)
        : (Array.isArray(optionsOrDeps) ? (optionsOrDeps as DependencyList) : undefined));

  const config: RealtimeSubscriptionConfig<T> | RealtimeSubscriptionConfig<T>[] = isString
    ? { table: tableOrOptions, onChange, ...extraOptions }
    : tableOrOptions;

  return useRealtimeSubscription<T>(config, deps);
}


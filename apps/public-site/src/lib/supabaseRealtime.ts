/**
 * Re-exports and realtime helper utilities for the GSA HUB platform.
 */
export {
  useRealtime,
  useRealtimeSubscription,
  type RealtimePostgresEvent,
  type RealtimeSubscriptionStatus,
  type RealtimeSubscriptionConfig,
  type RealtimeSubscriptionOptions,
  type RealtimeSubscriptionResult,
} from '../hooks/useRealtime';

import type { RealtimePostgresChangesPayload, RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { RealtimeSubscriptionConfig, RealtimePostgresEvent } from '../hooks/useRealtime';

/**
 * Imperative helper to subscribe to database changes outside of React component lifecycle.
 * Returns an unsubscribe function.
 */
export function subscribeToTable<T = any>(
  table: string,
  onChange: (payload: RealtimePostgresChangesPayload<T>) => void,
  options?: {
    schema?: string;
    filter?: string;
    event?: RealtimePostgresEvent;
    channelName?: string;
  }
): () => void {
  const schema = options?.schema || 'public';
  const event = options?.event || '*';
  const filter = options?.filter;
  const channelName = options?.channelName || `sub_${table}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const changeConfig: {
    event: RealtimePostgresEvent;
    schema: string;
    table: string;
    filter?: string;
  } = {
    event,
    schema,
    table,
  };

  if (filter) {
    changeConfig.filter = filter;
  }

  const channel: RealtimeChannel = supabase
    .channel(channelName)
    .on('postgres_changes', changeConfig as any, (payload: RealtimePostgresChangesPayload<T>) => {
      try {
        onChange(payload);
      } catch (err) {
        console.error(`[subscribeToTable] Error handling payload for ${table}:`, err);
      }
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel).catch((err) => {
      console.warn(`[subscribeToTable] Cleanup error on channel ${channelName}:`, err);
    });
  };
}

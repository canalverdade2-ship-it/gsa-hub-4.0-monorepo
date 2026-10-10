/**
 * @deprecated Use `useRealtimeSubscription` from './useRealtime' instead.
 * This hook is maintained solely for backward compatibility and will be removed in a future release.
 */
import { useRealtimeSubscription } from './useRealtime';

export function useRealtimeTable(
  tables: string | string[],
  onRefresh: () => void,
  _channelPrefix?: string
): void {
  const tableList = Array.isArray(tables) ? tables : [tables];
  const configs = tableList.map((table) => ({
    table,
    onChange: onRefresh,
    debounceMs: 300,
    channelName: _channelPrefix ? `rt-${_channelPrefix}` : undefined,
  }));

  useRealtimeSubscription(configs);
}
